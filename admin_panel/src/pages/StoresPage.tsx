import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tag,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { getApiErrorMessage } from "../api/http";
import { fetchMe } from "../auth/auth.api";
import {
  type AdminStore,
  createAdminStore,
  fetchAdminStores,
  updateAdminStore,
} from "../stores/stores.api";
import { normalizeTrim, slugify } from "../utils/forms";

type StoreForm = {
  name: string;
  slug: string;
};

export function StoresPage() {
  const queryClient = useQueryClient();
  const [msg, contextHolder] = message.useMessage();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<AdminStore | null>(null);
  const [form] = Form.useForm<StoreForm>();

  const meQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: fetchMe,
  });

  const storesQuery = useQuery({
    queryKey: ["admin", "stores"],
    queryFn: fetchAdminStores,
    enabled: !!meQuery.data?.is_superuser,
    retry: false,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["admin", "stores"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "my-stores"] });
  };

  const createMutation = useMutation({
    mutationFn: (payload: StoreForm) => createAdminStore(payload),
    onSuccess: () => {
      msg.success("Loja criada");
      setIsModalOpen(false);
      form.resetFields();
      refresh();
    },
    onError: (error) => msg.error(getApiErrorMessage(error, "Falha ao criar loja")),
  });

  const editMutation = useMutation({
    mutationFn: (payload: StoreForm) => updateAdminStore(editingStore!.id, payload),
    onSuccess: () => {
      msg.success("Loja atualizada");
      setIsModalOpen(false);
      setEditingStore(null);
      form.resetFields();
      refresh();
    },
    onError: (error) => msg.error(getApiErrorMessage(error, "Falha ao atualizar loja")),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ storeId, isActive }: { storeId: number; isActive: boolean }) =>
      updateAdminStore(storeId, { is_active: isActive }),
    onSuccess: (_, vars) => {
      msg.success(vars.isActive ? "Loja ativada" : "Loja desativada");
      refresh();
    },
    onError: (error) => msg.error(getApiErrorMessage(error, "Falha ao alterar status")),
  });

  const columns: ColumnsType<AdminStore> = [
    { title: "ID", dataIndex: "id", width: 90 },
    { title: "Nome", dataIndex: "name" },
    { title: "Slug", dataIndex: "slug" },
    {
      title: "Status",
      dataIndex: "is_active",
      width: 120,
      render: (value: boolean) => <Tag color={value ? "green" : "default"}>{value ? "Ativa" : "Inativa"}</Tag>,
    },
    {
      title: "Acoes",
      key: "actions",
      width: 220,
      render: (_, row) => (
        <Space>
          <Button
            size="small"
            onClick={() => {
              setEditingStore(row);
              form.setFieldsValue({ name: row.name, slug: row.slug });
              setIsModalOpen(true);
            }}
          >
            Editar
          </Button>
          <Popconfirm
            title={row.is_active ? "Desativar loja?" : "Ativar loja?"}
            onConfirm={() => toggleMutation.mutate({ storeId: row.id, isActive: !row.is_active })}
          >
            <Button size="small" loading={toggleMutation.isPending}>
              {row.is_active ? "Desativar" : "Ativar"}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card
      title="Gestao de Lojas"
      style={{ marginTop: 16 }}
      extra={
        <Button
          type="primary"
          onClick={() => {
            setEditingStore(null);
            form.resetFields();
            setIsModalOpen(true);
          }}
          disabled={!meQuery.data?.is_superuser}
        >
          Nova loja
        </Button>
      }
    >
      {contextHolder}
      {!meQuery.data?.is_superuser ? (
        <Alert
          type="warning"
          showIcon
          message="Acesso restrito"
          description="Somente superuser pode gerenciar lojas."
        />
      ) : storesQuery.isError ? (
        <Alert
          type="error"
          showIcon
          message="Falha ao carregar lojas"
          description={getApiErrorMessage(storesQuery.error)}
        />
      ) : (
        <Table<AdminStore>
          rowKey="id"
          loading={storesQuery.isLoading}
          dataSource={storesQuery.data ?? []}
          columns={columns}
          pagination={false}
        />
      )}

      <Modal
        title={editingStore ? "Editar loja" : "Nova loja"}
        open={isModalOpen}
        onCancel={() => {
          setIsModalOpen(false);
          setEditingStore(null);
        }}
        onOk={() => form.submit()}
        confirmLoading={createMutation.isPending || editMutation.isPending}
      >
        <Form<StoreForm>
          form={form}
          layout="vertical"
          onFinish={(values) => {
            const payload = {
              name: normalizeTrim(values.name),
              slug: slugify(values.slug),
            };
            if (editingStore) {
              editMutation.mutate(payload);
            } else {
              createMutation.mutate(payload);
            }
          }}
        >
          <Form.Item
            name="name"
            label="Nome"
            rules={[
              { required: true, message: "Informe o nome" },
              { min: 3, message: "Use pelo menos 3 caracteres" },
            ]}
          >
            <Input maxLength={120} />
          </Form.Item>
          <Form.Item
            name="slug"
            label="Slug"
            rules={[
              { required: true, message: "Informe o slug" },
              { pattern: /^[a-z0-9-]+$/, message: "Use apenas letras minusculas, numeros e hifen" },
            ]}
          >
            <Input maxLength={120} onBlur={(event) => form.setFieldValue("slug", slugify(event.target.value))} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
