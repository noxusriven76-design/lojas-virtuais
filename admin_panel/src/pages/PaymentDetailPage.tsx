import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Space,
  Tag,
  Timeline,
  Typography,
  message,
} from "antd";
import type { ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getApiErrorMessage } from "../api/http";
import { authStore } from "../auth/auth.store";
import { hasStorePermission } from "../authz/permissions";
import { ListState } from "../components/ui/ListState";
import {
  fetchStorePaymentById,
  fetchStorePaymentRefunds,
  fetchStorePaymentWebhookEvents,
  refundStorePayment,
} from "../payments/payments.api";
import { fetchMyStores } from "../stores/stores.api";
import { useCurrentStoreId } from "../stores/store.store";

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: currency || "BRL" }).format(value || 0);
}

function statusColor(status: string) {
  if (status === "paid") return "green";
  if (status === "authorized") return "blue";
  if (status === "partially_refunded") return "orange";
  if (status === "refunded") return "purple";
  if (status === "failed" || status === "cancelled") return "red";
  return "gold";
}

export function PaymentDetailPage() {
  const storeId = useCurrentStoreId();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [msg, contextHolder] = message.useMessage();
  const [refundForm] = Form.useForm<{ amount?: number; reason: string }>();
  const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);
  const params = useParams();
  const paymentId = Number(params.paymentId || 0);
  const storesQuery = useQuery({
    queryKey: ["admin", "my-stores"],
    queryFn: fetchMyStores,
    enabled: !!storeId,
  });

  const detailQuery = useQuery({
    queryKey: ["admin", "payments", "detail", storeId, paymentId],
    queryFn: () => fetchStorePaymentById(storeId!, paymentId),
    enabled: !!storeId && paymentId > 0,
  });

  const refundsQuery = useQuery({
    queryKey: ["admin", "payments", "refunds", storeId, paymentId],
    queryFn: () => fetchStorePaymentRefunds(storeId!, paymentId),
    enabled: !!storeId && paymentId > 0,
  });

  const eventsQuery = useQuery({
    queryKey: ["admin", "payments", "events", storeId, paymentId],
    queryFn: () => fetchStorePaymentWebhookEvents(storeId!, paymentId, 60),
    enabled: !!storeId && paymentId > 0,
  });

  const refundMutation = useMutation({
    mutationFn: (payload: { amount?: number; reason: string }) => refundStorePayment(storeId!, paymentId, payload),
    onSuccess: () => {
      msg.success("Estorno registrado com sucesso");
      setIsRefundModalOpen(false);
      refundForm.resetFields();
      queryClient.invalidateQueries({ queryKey: ["admin", "payments", "detail", storeId, paymentId] });
      queryClient.invalidateQueries({ queryKey: ["admin", "payments", "refunds", storeId, paymentId] });
      queryClient.invalidateQueries({ queryKey: ["admin", "payments", storeId] });
    },
    onError: (error) => msg.error(getApiErrorMessage(error, "Falha ao aplicar estorno")),
  });

  const refundableAmount = useMemo(() => {
    if (!detailQuery.data) return 0;
    const remaining = Number(detailQuery.data.amount || 0) - Number(detailQuery.data.refunded_amount || 0);
    return Math.max(0, Number(remaining.toFixed(2)));
  }, [detailQuery.data]);
  const canRefund = hasStorePermission(
    storesQuery.data,
    storeId,
    "payments.refund",
    !!authStore.getUser()?.is_superuser
  );

  const timelineItems = useMemo(() => {
    const base = [] as Array<{ sort: number; color: string; node: ReactNode }>;

    if (detailQuery.data) {
      base.push({
        sort: new Date(detailQuery.data.created_at).getTime(),
        color: "blue",
        node: (
          <Space direction="vertical" size={2}>
            <Typography.Text strong>Transacao criada</Typography.Text>
            <Typography.Text type="secondary">{new Date(detailQuery.data.created_at).toLocaleString("pt-BR")}</Typography.Text>
            <Typography.Text>Status: {detailQuery.data.status}</Typography.Text>
          </Space>
        ),
      });

      if (detailQuery.data.paid_at) {
        base.push({
          sort: new Date(detailQuery.data.paid_at).getTime(),
          color: "green",
          node: (
            <Space direction="vertical" size={2}>
              <Typography.Text strong>Pagamento confirmado</Typography.Text>
              <Typography.Text type="secondary">{new Date(detailQuery.data.paid_at).toLocaleString("pt-BR")}</Typography.Text>
            </Space>
          ),
        });
      }
    }

    for (const refund of refundsQuery.data?.items ?? []) {
      base.push({
        sort: new Date(refund.created_at).getTime(),
        color: refund.status === "succeeded" ? "orange" : "red",
        node: (
          <Space direction="vertical" size={2}>
            <Typography.Text strong>Estorno {refund.status}</Typography.Text>
            <Typography.Text>
              {formatMoney(refund.amount, detailQuery.data?.currency || "BRL")} - {refund.reason}
            </Typography.Text>
            <Typography.Text type="secondary">{new Date(refund.created_at).toLocaleString("pt-BR")}</Typography.Text>
          </Space>
        ),
      });
    }

    for (const event of eventsQuery.data?.items ?? []) {
      base.push({
        sort: new Date(event.created_at).getTime(),
        color: event.status === "processed" ? "green" : event.status === "failed" ? "red" : "blue",
        node: (
          <Space direction="vertical" size={2}>
            <Typography.Text strong>Webhook: {event.event_type}</Typography.Text>
            <Typography.Text>
              {event.provider} / {event.status} / assinatura {event.signature_valid ? "valida" : "invalida"}
            </Typography.Text>
            {event.error_message ? <Typography.Text type="danger">{event.error_message}</Typography.Text> : null}
            <Typography.Text type="secondary">{new Date(event.created_at).toLocaleString("pt-BR")}</Typography.Text>
          </Space>
        ),
      });
    }

    return base.sort((a, b) => b.sort - a.sort).map((item) => ({ color: item.color, children: item.node }));
  }, [detailQuery.data, refundsQuery.data?.items, eventsQuery.data?.items]);

  if (!storeId) {
    return (
      <Card title="Detalhe do pagamento" style={{ marginTop: 16 }}>
        <Alert type="info" showIcon message="Selecione uma loja para visualizar pagamentos." />
      </Card>
    );
  }

  if (!paymentId) {
    return (
      <Card title="Detalhe do pagamento" style={{ marginTop: 16 }}>
        <Alert type="warning" showIcon message="Pagamento invalido" description="Informe um payment_id valido." />
      </Card>
    );
  }

  return (
    <Space direction="vertical" size={16} style={{ width: "100%", marginTop: 16 }}>
      {contextHolder}
      <Card title={`Pagamento #${paymentId}`} extra={<Button onClick={() => navigate("/finance/payments")}>Voltar</Button>}>
        <Typography.Paragraph>
          <strong>store_id atual:</strong> {storeId}
        </Typography.Paragraph>

        <ListState
          loading={detailQuery.isLoading}
          isError={detailQuery.isError}
          errorMessage={getApiErrorMessage(detailQuery.error, "Falha ao carregar pagamento")}
          isEmpty={!detailQuery.isLoading && !detailQuery.isError && !detailQuery.data}
          emptyDescription="Pagamento nao encontrado"
          onRetry={() => detailQuery.refetch()}
        >
          {detailQuery.data ? (
            <Space direction="vertical" size={16} style={{ width: "100%" }}>
              <Descriptions bordered size="small" column={2}>
                <Descriptions.Item label="Status">
                  <Tag color={statusColor(detailQuery.data.status)}>{detailQuery.data.status}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Valor">
                  {formatMoney(detailQuery.data.amount, detailQuery.data.currency)}
                </Descriptions.Item>
                <Descriptions.Item label="Pedido">#{detailQuery.data.order_id}</Descriptions.Item>
                <Descriptions.Item label="Cliente">
                  {detailQuery.data.customer_name || "-"}
                  {detailQuery.data.customer_email ? ` (${detailQuery.data.customer_email})` : ""}
                </Descriptions.Item>
                <Descriptions.Item label="Provider">{detailQuery.data.provider}</Descriptions.Item>
                <Descriptions.Item label="Pagamento externo">
                  {detailQuery.data.provider_payment_id || "-"}
                </Descriptions.Item>
                <Descriptions.Item label="Metodo">{detailQuery.data.method || "-"}</Descriptions.Item>
                <Descriptions.Item label="Pago em">
                  {detailQuery.data.paid_at ? new Date(detailQuery.data.paid_at).toLocaleString("pt-BR") : "-"}
                </Descriptions.Item>
                <Descriptions.Item label="Total estornado">
                  {formatMoney(detailQuery.data.refunded_amount, detailQuery.data.currency)}
                </Descriptions.Item>
              </Descriptions>

              <Space>
                <Button onClick={() => navigate("/orders")}>Abrir pedidos</Button>
                <Button
                  type="primary"
                  disabled={
                    !canRefund ||
                    refundableAmount <= 0 ||
                    !["paid", "partially_refunded"].includes(detailQuery.data.status)
                  }
                  onClick={() => setIsRefundModalOpen(true)}
                >
                  Estornar
                </Button>
              </Space>
              {!canRefund ? (
                <Typography.Text type="secondary">
                  Seu perfil nao possui permissao para estorno (`payments.refund`).
                </Typography.Text>
              ) : null}
              <Typography.Text type="secondary">
                Valor disponivel para estorno: {formatMoney(refundableAmount, detailQuery.data.currency)}
              </Typography.Text>
            </Space>
          ) : null}
        </ListState>
      </Card>

      <Card title="Timeline financeira">
        <ListState
          loading={refundsQuery.isLoading || eventsQuery.isLoading}
          isError={refundsQuery.isError || eventsQuery.isError}
          errorMessage={getApiErrorMessage(refundsQuery.error || eventsQuery.error, "Falha ao carregar timeline")}
          isEmpty={!refundsQuery.isLoading && !eventsQuery.isLoading && timelineItems.length === 0}
          emptyDescription="Sem eventos para este pagamento"
          onRetry={() => {
            refundsQuery.refetch();
            eventsQuery.refetch();
          }}
        >
          <Timeline items={timelineItems} />
        </ListState>
      </Card>

      <Modal
        title="Confirmar estorno"
        open={isRefundModalOpen}
        onCancel={() => setIsRefundModalOpen(false)}
        onOk={async () => {
          try {
            const values = await refundForm.validateFields();
            Modal.confirm({
              title: "Aplicar estorno?",
              content: `Motivo: ${values.reason}`,
              okText: "Confirmar estorno",
              cancelText: "Cancelar",
              okButtonProps: { danger: true, loading: refundMutation.isPending },
              onOk: async () => {
                await refundMutation.mutateAsync({
                  amount: values.amount,
                  reason: values.reason,
                });
              },
            });
          } catch {
            return;
          }
        }}
        okText="Avancar"
      >
        <Form form={refundForm} layout="vertical">
          <Form.Item
            label="Valor do estorno (opcional para estorno total)"
            name="amount"
            rules={[
              {
                validator: (_, value: number | undefined) => {
                  if (value === undefined || value === null) return Promise.resolve();
                  if (value <= 0) return Promise.reject(new Error("Valor deve ser maior que zero"));
                  if (value > refundableAmount) {
                    return Promise.reject(new Error("Valor maior que saldo estornavel"));
                  }
                  return Promise.resolve();
                },
              },
            ]}
          >
            <InputNumber style={{ width: "100%" }} min={0.01} step={0.01} precision={2} />
          </Form.Item>
          <Form.Item
            label="Motivo"
            name="reason"
            rules={[{ required: true, message: "Informe o motivo" }, { min: 3, message: "Minimo de 3 caracteres" }]}
          >
            <Input.TextArea rows={3} maxLength={300} />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
