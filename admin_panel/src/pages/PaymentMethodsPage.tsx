import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Card, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Switch, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { getApiErrorMessage } from "../api/http";
import { authStore } from "../auth/auth.store";
import { hasStorePermission } from "../authz/permissions";
import { ListState } from "../components/ui/ListState";
import {
  createStorePaymentMethod,
  deleteStorePaymentMethod,
  fetchStorePaymentMethods,
  reorderStorePaymentMethods,
  type StorePaymentMethod,
  type StorePaymentMethodPayload,
  updateStorePaymentMethod,
} from "../payments/paymentMethods.api";
import { fetchMyStores } from "../stores/stores.api";
import { useCurrentStoreId } from "../stores/store.store";

const CODE_OPTIONS = [
  { value: "pix", label: "PIX" },
  { value: "credit_card", label: "Cartao de credito" },
  { value: "debit_card", label: "Cartao de debito" },
  { value: "boleto", label: "Boleto" },
  { value: "cash", label: "Dinheiro" },
];

function formatMoney(value: number | null) {
  if (value == null) return "-";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

type MethodFormValues = StorePaymentMethodPayload;

export function PaymentMethodsPage() {
  const storeId = useCurrentStoreId();
  const queryClient = useQueryClient();
  const [msg, contextHolder] = message.useMessage();
  const [form] = Form.useForm<MethodFormValues>();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<StorePaymentMethod | null>(null);
  const [draftOrder, setDraftOrder] = useState<number[]>([]);

  const storesQuery = useQuery({
    queryKey: ["admin", "my-stores"],
    queryFn: fetchMyStores,
    enabled: !!storeId,
  });
  const canWrite = hasStorePermission(
    storesQuery.data,
    storeId,
    "payments.write",
    !!authStore.getUser()?.is_superuser
  );

  const methodsQuery = useQuery({
    queryKey: ["admin", "payment-methods", storeId],
    queryFn: () => fetchStorePaymentMethods(storeId!),
    enabled: !!storeId,
  });

  useEffect(() => {
    const ids = (methodsQuery.data?.items ?? []).map((row) => row.id);
    setDraftOrder(ids);
  }, [methodsQuery.data?.items]);

  const orderedDraftRows = useMemo(() => {
    const map = new Map((methodsQuery.data?.items ?? []).map((row) => [row.id, row]));
    return draftOrder.map((id) => map.get(id)).filter((row): row is StorePaymentMethod => !!row);
  }, [draftOrder, methodsQuery.data?.items]);

  const createMutation = useMutation({
    mutationFn: (payload: StorePaymentMethodPayload) => createStorePaymentMethod(storeId!, payload),
    onSuccess: () => {
      msg.success("Forma de pagamento criada");
      setModalOpen(false);
      form.resetFields();
      queryClient.invalidateQueries({ queryKey: ["admin", "payment-methods", storeId] });
    },
    onError: (error) => msg.error(getApiErrorMessage(error, "Falha ao criar forma de pagamento")),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<StorePaymentMethodPayload> }) =>
      updateStorePaymentMethod(storeId!, id, payload),
    onSuccess: () => {
      msg.success("Forma de pagamento atualizada");
      setModalOpen(false);
      form.resetFields();
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["admin", "payment-methods", storeId] });
    },
    onError: (error) => msg.error(getApiErrorMessage(error, "Falha ao atualizar forma de pagamento")),
  });

  const deleteMutation = useMutation({
    mutationFn: (methodId: number) => deleteStorePaymentMethod(storeId!, methodId),
    onSuccess: () => {
      msg.success("Forma de pagamento removida");
      queryClient.invalidateQueries({ queryKey: ["admin", "payment-methods", storeId] });
    },
    onError: (error) => msg.error(getApiErrorMessage(error, "Falha ao remover forma de pagamento")),
  });

  const reorderMutation = useMutation({
    mutationFn: () =>
      reorderStorePaymentMethods(
        storeId!,
        draftOrder.map((id, index) => ({ id, sort_order: index }))
      ),
    onSuccess: () => {
      msg.success("Ordem salva");
      queryClient.invalidateQueries({ queryKey: ["admin", "payment-methods", storeId] });
    },
    onError: (error) => msg.error(getApiErrorMessage(error, "Falha ao salvar ordem")),
  });

  const openCreateModal = () => {
    setEditing(null);
    form.setFieldsValue({
      code: "pix",
      label: "PIX",
      is_active: true,
      sort_order: draftOrder.length,
      min_amount: null,
      max_amount: null,
      installments_max: null,
      fee_percent: null,
      settlement_days: null,
      metadata_json: null,
    });
    setModalOpen(true);
  };

  const openEditModal = (row: StorePaymentMethod) => {
    setEditing(row);
    form.setFieldsValue({
      code: row.code,
      label: row.label,
      is_active: row.is_active,
      sort_order: row.sort_order,
      min_amount: row.min_amount,
      max_amount: row.max_amount,
      installments_max: row.installments_max,
      fee_percent: row.fee_percent,
      settlement_days: row.settlement_days,
      metadata_json: row.metadata_json ?? null,
    });
    setModalOpen(true);
  };

  const moveRow = (id: number, direction: -1 | 1) => {
    setDraftOrder((prev) => {
      const idx = prev.indexOf(id);
      if (idx < 0) return prev;
      const target = idx + direction;
      if (target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(idx, 1);
      copy.splice(target, 0, item);
      return copy;
    });
  };

  const columns: ColumnsType<StorePaymentMethod> = [
    { title: "Ordem", key: "order", width: 130, render: (_, row, idx) => (
      <Space>
        <Button size="small" onClick={() => moveRow(row.id, -1)} disabled={!canWrite || idx === 0}>↑</Button>
        <Button size="small" onClick={() => moveRow(row.id, 1)} disabled={!canWrite || idx === orderedDraftRows.length - 1}>↓</Button>
      </Space>
    )},
    { title: "Nome", dataIndex: "label", width: 200 },
    { title: "Tipo", dataIndex: "code", width: 150 },
    {
      title: "Status",
      dataIndex: "is_active",
      width: 120,
      render: (value: boolean) => (value ? <Tag color="green">Ativo</Tag> : <Tag color="default">Inativo</Tag>),
    },
    {
      title: "Regras",
      key: "rules",
      render: (_, row) => (
        <Space direction="vertical" size={0}>
          <Typography.Text type="secondary">Min/Max: {formatMoney(row.min_amount)} / {formatMoney(row.max_amount)}</Typography.Text>
          <Typography.Text type="secondary">
            Parcelas: {row.installments_max ?? "-"} | Taxa: {row.fee_percent ?? "-"}% | Repasse: {row.settlement_days ?? "-"}d
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: "Acoes",
      key: "actions",
      width: 190,
      render: (_, row) => (
        <Space>
          <Button size="small" onClick={() => openEditModal(row)} disabled={!canWrite}>Editar</Button>
          <Popconfirm
            title="Remover forma de pagamento?"
            onConfirm={() => deleteMutation.mutate(row.id)}
            okText="Remover"
            cancelText="Cancelar"
            disabled={!canWrite}
          >
            <Button size="small" danger disabled={!canWrite}>Remover</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  if (!storeId) {
    return (
      <Card title="Formas de pagamento" style={{ marginTop: 16 }}>
        <Alert type="info" showIcon message="Selecione uma loja para configurar formas de pagamento." />
      </Card>
    );
  }

  return (
    <Card title="Formas de pagamento" style={{ marginTop: 16 }}>
      {contextHolder}
      <Typography.Paragraph>
        <strong>store_id atual:</strong> {storeId}
      </Typography.Paragraph>

      {!canWrite ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message="Seu perfil nao possui permissao de edicao (payments.write)."
        />
      ) : null}

      <Space style={{ marginBottom: 12 }}>
        <Button type="primary" onClick={openCreateModal} disabled={!canWrite}>
          Nova forma
        </Button>
        <Button
          onClick={() => reorderMutation.mutate()}
          loading={reorderMutation.isPending}
          disabled={!canWrite || orderedDraftRows.length === 0}
        >
          Salvar ordem
        </Button>
      </Space>

      <ListState
        loading={methodsQuery.isLoading}
        isError={methodsQuery.isError}
        errorMessage={getApiErrorMessage(methodsQuery.error, "Falha ao carregar formas de pagamento")}
        isEmpty={!methodsQuery.isLoading && !methodsQuery.isError && orderedDraftRows.length === 0}
        emptyDescription="Nenhuma forma de pagamento configurada para esta loja"
        onRetry={() => methodsQuery.refetch()}
      >
        <Table rowKey="id" dataSource={orderedDraftRows} columns={columns} pagination={false} />
      </ListState>

      <Modal
        title={editing ? "Editar forma de pagamento" : "Nova forma de pagamento"}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          setEditing(null);
          form.resetFields();
        }}
        onOk={async () => {
          try {
            const values = await form.validateFields();
            if (editing) {
              updateMutation.mutate({ id: editing.id, payload: values });
            } else {
              createMutation.mutate(values);
            }
          } catch {
            return;
          }
        }}
        okButtonProps={{ loading: createMutation.isPending || updateMutation.isPending, disabled: !canWrite }}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item name="code" label="Tipo" rules={[{ required: true, message: "Selecione o tipo" }]}>
            <Select options={CODE_OPTIONS} disabled={!!editing} />
          </Form.Item>
          <Form.Item name="label" label="Nome exibido" rules={[{ required: true, message: "Informe o nome exibido" }]}>
            <Input maxLength={120} />
          </Form.Item>
          <Form.Item name="is_active" label="Ativo" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="sort_order" label="Ordem" rules={[{ required: true, message: "Informe a ordem" }]}>
            <InputNumber min={0} max={9999} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="min_amount" label="Valor minimo">
            <InputNumber min={0} step={0.01} precision={2} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="max_amount" label="Valor maximo">
            <InputNumber min={0} step={0.01} precision={2} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="installments_max" label="Parcelas maximas">
            <InputNumber min={1} max={36} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="fee_percent" label="Taxa (%)">
            <InputNumber min={0} max={100} step={0.01} precision={2} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="settlement_days" label="Prazo de repasse (dias)">
            <InputNumber min={0} max={365} style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}

