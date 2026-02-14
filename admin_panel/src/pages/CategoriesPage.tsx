import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  type Category,
  createCategory,
  deleteCategory,
  fetchCategories,
  updateCategory,
} from "../catalog/categories.api";
import { getApiErrorMessage } from "../api/http";
import { useCurrentStoreId } from "../stores/store.store";
import { normalizeTrim } from "../utils/forms";

type FormValues = {
  name: string;
  parent_id?: number | null;
  is_active?: boolean;
  sort_order?: number;
};

type TableRow = Category & { level: number };

function flattenTree(rows: Category[], level = 0): TableRow[] {
  return rows.flatMap((row) => {
    const current: TableRow = { ...row, level };
    const children = row.children ? flattenTree(row.children, level + 1) : [];
    return [current, ...children];
  });
}

export function CategoriesPage() {
  const storeId = useCurrentStoreId();
  const queryClient = useQueryClient();
  const [msg, contextHolder] = message.useMessage();
  const [treeMode, setTreeMode] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [orderedRows, setOrderedRows] = useState<TableRow[]>([]);
  const [hasPendingOrder, setHasPendingOrder] = useState(false);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);
  const [form] = Form.useForm<FormValues>();

  const categoriesQuery = useQuery({
    queryKey: ["admin", "categories", storeId, treeMode],
    queryFn: () => fetchCategories(storeId!, treeMode),
    enabled: !!storeId,
  });

  const flatCategoriesQuery = useQuery({
    queryKey: ["admin", "categories", storeId, "flat"],
    queryFn: () => fetchCategories(storeId!, false),
    enabled: !!storeId,
  });

  const rows = useMemo(
    () => (treeMode ? flattenTree(categoriesQuery.data ?? []) : flattenTree(categoriesQuery.data ?? [], 0)),
    [categoriesQuery.data, treeMode]
  );

  useEffect(() => {
    setOrderedRows(rows);
    setHasPendingOrder(false);
  }, [rows]);

  const refreshCategories = () => {
    queryClient.invalidateQueries({ queryKey: ["admin", "categories", storeId] });
    queryClient.invalidateQueries({ queryKey: ["admin", "categories", storeId, "flat"] });
  };

  const createMutation = useMutation({
    mutationFn: (payload: FormValues) => createCategory(storeId!, { name: normalizeTrim(payload.name) }),
    onSuccess: () => {
      msg.success("Categoria criada");
      setIsModalOpen(false);
      form.resetFields();
      refreshCategories();
    },
    onError: (error) => msg.error(getApiErrorMessage(error, "Falha ao criar categoria")),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: FormValues) =>
      updateCategory(storeId!, editingCategory!.id, {
        name: normalizeTrim(payload.name),
        parent_id: payload.parent_id ?? null,
        is_active: payload.is_active,
        sort_order: payload.sort_order,
      }),
    onSuccess: () => {
      msg.success("Categoria atualizada");
      setIsModalOpen(false);
      setEditingCategory(null);
      form.resetFields();
      refreshCategories();
    },
    onError: (error) => msg.error(getApiErrorMessage(error, "Falha ao atualizar categoria")),
  });

  const deleteMutation = useMutation({
    mutationFn: (categoryId: number) => deleteCategory(storeId!, categoryId),
    onSuccess: () => {
      msg.success("Categoria removida");
      refreshCategories();
    },
    onError: (error) => msg.error(getApiErrorMessage(error, "Falha ao remover categoria")),
  });

  const reorderMutation = useMutation({
    mutationFn: async (nextRows: TableRow[]) => {
      await Promise.all(
        nextRows.map((row, index) =>
          updateCategory(storeId!, row.id, {
            sort_order: index,
          })
        )
      );
    },
    onSuccess: () => {
      msg.success("Ordem das categorias atualizada");
      setHasPendingOrder(false);
      refreshCategories();
    },
    onError: (error) => {
      msg.error(getApiErrorMessage(error, "Falha ao salvar ordem das categorias"));
      setOrderedRows(rows);
      setHasPendingOrder(false);
    },
  });

  const moveRow = (list: TableRow[], fromId: number, toId: number): TableRow[] => {
    const fromIndex = list.findIndex((row) => row.id === fromId);
    const toIndex = list.findIndex((row) => row.id === toId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return list;
    const next = [...list];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    return next;
  };

  const handleDrop = (targetId: number) => {
    if (treeMode || draggingId == null || draggingId === targetId || reorderMutation.isPending) return;
    const nextRows = moveRow(orderedRows, draggingId, targetId);
    if (nextRows === orderedRows) return;
    setOrderedRows(nextRows);
    setHasPendingOrder(true);
  };

  const handleSaveOrder = () => {
    if (treeMode || !hasPendingOrder || reorderMutation.isPending) return;
    reorderMutation.mutate(orderedRows);
  };

  const handleDiscardOrder = () => {
    if (reorderMutation.isPending) return;
    setOrderedRows(rows);
    setHasPendingOrder(false);
  };

  const columns: ColumnsType<TableRow> = [
    {
      title: "Mover",
      key: "drag",
      width: 72,
      render: () => (
        <Typography.Text type={treeMode ? "secondary" : undefined} style={{ cursor: treeMode ? "not-allowed" : "grab" }}>
          ⋮⋮
        </Typography.Text>
      ),
    },
    {
      title: "Nome",
      dataIndex: "name",
      render: (_, row) => (
        <span style={{ paddingLeft: row.level * 20 }}>
          {row.level > 0 ? "|- " : ""}
          {row.name}
        </span>
      ),
    },
    { title: "ID", dataIndex: "id", width: 90 },
    {
      title: "Ativa",
      dataIndex: "is_active",
      width: 110,
      render: (value) =>
        typeof value === "boolean" ? <Tag color={value ? "green" : "default"}>{value ? "Sim" : "Nao"}</Tag> : "-",
    },
    { title: "Ordem", dataIndex: "sort_order", width: 90, render: (value) => (value ?? "-") },
    {
      title: "Acoes",
      key: "actions",
      width: 180,
      render: (_, row) => (
        <Space>
          <Button
            size="small"
            onClick={() => {
              setEditingCategory(row);
              form.setFieldsValue({
                name: row.name,
                parent_id: row.parent_id,
                is_active: row.is_active ?? true,
                sort_order: row.sort_order ?? 0,
              });
              setIsModalOpen(true);
            }}
          >
            Editar
          </Button>
          <Popconfirm
            title="Remover categoria?"
            description="Nao sera possivel remover se houver filhos ou produtos vinculados."
            onConfirm={() => deleteMutation.mutate(row.id)}
          >
            <Button danger size="small" loading={deleteMutation.isPending}>
              Excluir
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  if (!storeId) {
    return (
      <Card title="Categorias" style={{ marginTop: 16 }}>
        <Alert type="info" showIcon message="Selecione uma loja para gerenciar categorias." />
      </Card>
    );
  }

  const parentOptions = (flatCategoriesQuery.data ?? [])
    .filter((category) => !editingCategory || category.id !== editingCategory.id)
    .map((category) => ({ label: category.name, value: category.id }));

  return (
    <Card
      title="Categorias"
      style={{ marginTop: 16 }}
      extra={
        <Space>
          <Typography.Text>Modo arvore (desativa arrastar)</Typography.Text>
          <Switch checked={treeMode} onChange={setTreeMode} />
          <Button onClick={handleDiscardOrder} disabled={treeMode || !hasPendingOrder || reorderMutation.isPending}>
            Descartar ordem
          </Button>
          <Button
            type="primary"
            onClick={handleSaveOrder}
            disabled={treeMode || !hasPendingOrder}
            loading={reorderMutation.isPending}
          >
            Salvar ordem
          </Button>
          <Button
            type="primary"
            onClick={() => {
              setEditingCategory(null);
              form.resetFields();
              form.setFieldsValue({ is_active: true, sort_order: 0 });
              setIsModalOpen(true);
            }}
          >
            Nova categoria
          </Button>
        </Space>
      }
    >
      {contextHolder}
      <Typography.Paragraph>
        <strong>store_id atual:</strong> {storeId}
      </Typography.Paragraph>
      <Typography.Paragraph type="secondary">
        {treeMode
          ? "Arrastar para ordenar funciona no modo lista."
          : "Arraste e solte para reordenar e clique em Salvar ordem para aplicar no site."}
      </Typography.Paragraph>

      {categoriesQuery.isError ? (
        <Alert
          type="error"
          showIcon
          message="Falha ao carregar categorias"
          description={getApiErrorMessage(categoriesQuery.error)}
        />
      ) : (
        <Table<TableRow>
          rowKey="id"
          loading={categoriesQuery.isLoading || reorderMutation.isPending}
          dataSource={treeMode ? rows : orderedRows}
          columns={columns}
          pagination={false}
          rowClassName={(row) => {
            if (treeMode) return "";
            if (row.id === draggingId) return "category-row-dragging";
            if (row.id === dragOverId) return "category-row-over";
            return "category-row-draggable";
          }}
          onRow={(record) => {
            if (treeMode) return {};
            return {
              draggable: !reorderMutation.isPending,
              onDragStart: () => {
                setDraggingId(record.id);
              },
              onDragOver: (event) => {
                event.preventDefault();
                if (dragOverId !== record.id) setDragOverId(record.id);
              },
              onDrop: () => {
                handleDrop(record.id);
                setDraggingId(null);
                setDragOverId(null);
              },
              onDragEnd: () => {
                setDraggingId(null);
                setDragOverId(null);
              },
            };
          }}
        />
      )}

      <Modal
        title={editingCategory ? "Editar categoria" : "Nova categoria"}
        open={isModalOpen}
        onCancel={() => {
          setIsModalOpen(false);
          setEditingCategory(null);
        }}
        onOk={() => form.submit()}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
      >
        <Form<FormValues>
          form={form}
          layout="vertical"
          onFinish={(values) => (editingCategory ? updateMutation.mutate(values) : createMutation.mutate(values))}
        >
          <Form.Item
            name="name"
            label="Nome"
            rules={[
              { required: true, message: "Informe o nome" },
              { min: 2, message: "Use pelo menos 2 caracteres" },
            ]}
          >
            <Input maxLength={80} />
          </Form.Item>
          {editingCategory ? (
            <>
              <Form.Item name="parent_id" label="Categoria pai">
                <Select
                  allowClear
                  options={parentOptions}
                  placeholder={parentOptions.length > 0 ? "Selecione (opcional)" : "Sem opcoes"}
                />
              </Form.Item>
              <Form.Item name="is_active" label="Ativa" valuePropName="checked">
                <Switch />
              </Form.Item>
              <Form.Item name="sort_order" label="Ordem">
                <InputNumber style={{ width: "100%" }} min={0} />
              </Form.Item>
            </>
          ) : null}
        </Form>
      </Modal>
    </Card>
  );
}
