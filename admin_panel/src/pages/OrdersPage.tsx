import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Drawer,
  Input,
  InputNumber,
  Select,
  Space,
  Table,
  Tag,
  Timeline,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { getApiErrorMessage, http } from "../api/http";
import { PageFilterBar } from "../components/ui/PageFilterBar";
import { ListState } from "../components/ui/ListState";
import {
  type AdminOrder,
  addStoreOrderNote,
  cancelStoreOrder,
  fetchStoreOrderById,
  fetchStoreOrders,
  fetchStoreOrderTimeline,
  updateStoreOrderStatus,
} from "../orders/orders.api";
import { useCurrentStoreId } from "../stores/store.store";

const PAGE_SIZE = 20;

const statusOptions = [
  { value: "novo", label: "novo" },
  { value: "pago", label: "pago" },
  { value: "enviado", label: "enviado" },
  { value: "concluido", label: "concluido" },
  { value: "cancelado", label: "cancelado" },
  { value: "parcialmente_cancelado", label: "parcialmente_cancelado" },
];

function statusColor(status: string) {
  if (status === "pago") return "green";
  if (status === "enviado") return "blue";
  if (status === "concluido") return "purple";
  if (status === "cancelado") return "red";
  if (status === "parcialmente_cancelado") return "orange";
  return "gold";
}

export function OrdersPage() {
  const storeId = useCurrentStoreId();
  const queryClient = useQueryClient();
  const [msg, contextHolder] = message.useMessage();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [nextStatusByOrder, setNextStatusByOrder] = useState<Record<number, string>>({});
  const [noteDraft, setNoteDraft] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [cancelQtyByItem, setCancelQtyByItem] = useState<Record<number, number>>({});
  const [selectedOrderIds, setSelectedOrderIds] = useState<number[]>([]);
  const [bulkNextStatus, setBulkNextStatus] = useState<string>("pago");

  const offset = (page - 1) * PAGE_SIZE;

  const ordersQuery = useQuery({
    queryKey: ["admin", "orders", storeId, PAGE_SIZE, offset, statusFilter ?? "", search, dateFrom, dateTo],
    queryFn: () =>
      fetchStoreOrders(storeId!, {
        limit: PAGE_SIZE,
        offset,
        status: statusFilter,
        q: search || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      }),
    enabled: !!storeId,
  });

  const detailQuery = useQuery({
    queryKey: ["admin", "order-detail", storeId, selectedOrderId],
    queryFn: () => fetchStoreOrderById(storeId!, selectedOrderId!),
    enabled: !!storeId && !!selectedOrderId,
  });

  const timelineQuery = useQuery({
    queryKey: ["admin", "order-timeline", storeId, selectedOrderId],
    queryFn: () => fetchStoreOrderTimeline(storeId!, selectedOrderId!),
    enabled: !!storeId && !!selectedOrderId,
  });

  const refreshOrderData = (orderId?: number) => {
    queryClient.invalidateQueries({ queryKey: ["admin", "orders", storeId] });
    if (orderId) {
      queryClient.invalidateQueries({ queryKey: ["admin", "order-detail", storeId, orderId] });
      queryClient.invalidateQueries({ queryKey: ["admin", "order-timeline", storeId, orderId] });
    }
  };

  const updateStatusMutation = useMutation({
    mutationFn: ({ orderId, status }: { orderId: number; status: string }) =>
      updateStoreOrderStatus(storeId!, orderId, status),
    onSuccess: (_, vars) => {
      msg.success(`Pedido #${vars.orderId} atualizado para "${vars.status}"`);
      refreshOrderData(vars.orderId);
    },
    onError: (error) => msg.error(getApiErrorMessage(error, "Falha ao atualizar status")),
  });

  const addNoteMutation = useMutation({
    mutationFn: ({ orderId, note }: { orderId: number; note: string }) => addStoreOrderNote(storeId!, orderId, note),
    onSuccess: (_, vars) => {
      msg.success("Nota interna registrada");
      setNoteDraft("");
      refreshOrderData(vars.orderId);
    },
    onError: (error) => msg.error(getApiErrorMessage(error, "Falha ao salvar nota")),
  });

  const cancelMutation = useMutation({
    mutationFn: ({
      orderId,
      reason,
      items,
    }: {
      orderId: number;
      reason: string;
      items?: Array<{ order_item_id: number; quantity: number }>;
    }) => cancelStoreOrder(storeId!, orderId, { reason, items }),
    onSuccess: (_, vars) => {
      msg.success("Cancelamento aplicado");
      setCancelReason("");
      setCancelQtyByItem({});
      refreshOrderData(vars.orderId);
    },
    onError: (error) => msg.error(getApiErrorMessage(error, "Falha ao cancelar pedido")),
  });

  const columns: ColumnsType<AdminOrder> = [
    { title: "Pedido", dataIndex: "id", width: 90 },
    {
      title: "Cliente",
      key: "customer",
      render: (_, row) => row.user_name ?? row.recipient_name ?? "-",
    },
    {
      title: "Status",
      dataIndex: "status",
      width: 170,
      render: (value: string) => <Tag color={statusColor(value)}>{value}</Tag>,
    },
    {
      title: "Total",
      dataIndex: "total",
      width: 120,
      render: (value: number) => `R$ ${Number(value).toFixed(2)}`,
    },
    {
      title: "Criado em",
      dataIndex: "created_at",
      width: 190,
      render: (value: string) => new Date(value).toLocaleString("pt-BR"),
    },
    {
      title: "Acoes",
      key: "actions",
      width: 320,
      render: (_, row) => (
        <Space wrap>
          <Select
            size="small"
            style={{ minWidth: 160 }}
            value={nextStatusByOrder[row.id] ?? row.status}
            options={statusOptions}
            onChange={(value) =>
              setNextStatusByOrder((prev) => ({
                ...prev,
                [row.id]: value,
              }))
            }
          />
          <Button
            size="small"
            type="primary"
            loading={updateStatusMutation.isPending}
            onClick={() =>
              updateStatusMutation.mutate({
                orderId: row.id,
                status: nextStatusByOrder[row.id] ?? row.status,
              })
            }
          >
            Atualizar
          </Button>
          <Button size="small" onClick={() => setSelectedOrderId(row.id)}>
            Operar
          </Button>
        </Space>
      ),
    },
  ];

  const activeItems = useMemo(() => {
    if (!detailQuery.data) return [];
    return detailQuery.data.items.map((item) => ({
      ...item,
      activeQty: Math.max(0, Number(item.quantity) - Number(item.cancelled_quantity || 0)),
    }));
  }, [detailQuery.data]);

  if (!storeId) {
    return (
      <Card title="Pedidos" style={{ marginTop: 16 }}>
        <Alert type="info" showIcon message="Selecione uma loja para gerenciar pedidos." />
      </Card>
    );
  }

  return (
    <Card title="Pedidos" style={{ marginTop: 16 }}>
      {contextHolder}
      <Typography.Paragraph>
        <strong>store_id atual:</strong> {storeId}
      </Typography.Paragraph>

      <PageFilterBar>
        <Select
          allowClear
          placeholder="Filtrar status"
          style={{ width: 180 }}
          options={statusOptions}
          value={statusFilter}
          onChange={(value) => {
            setPage(1);
            setStatusFilter(value);
          }}
        />
        <Input
          placeholder="Busca rapida (pedido, cliente, email, cep)"
          style={{ width: 320 }}
          allowClear
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
        />
        <Input
          placeholder="Data inicial (YYYY-MM-DD)"
          style={{ width: 200 }}
          value={dateFrom}
          onChange={(e) => {
            setPage(1);
            setDateFrom(e.target.value);
          }}
        />
        <Input
          placeholder="Data final (YYYY-MM-DD)"
          style={{ width: 200 }}
          value={dateTo}
          onChange={(e) => {
            setPage(1);
            setDateTo(e.target.value);
          }}
        />
        <Button
          onClick={() => {
            setPage(1);
            setStatusFilter(undefined);
            setSearch("");
            setDateFrom("");
            setDateTo("");
          }}
        >
          Limpar
        </Button>
      </PageFilterBar>

      <Space wrap style={{ margin: "8px 0 12px" }}>
        <Typography.Text>{selectedOrderIds.length} pedido(s) selecionado(s)</Typography.Text>
        <Select
          value={bulkNextStatus}
          style={{ width: 220 }}
          options={statusOptions}
          onChange={setBulkNextStatus}
        />
        <Button
          type="primary"
          disabled={selectedOrderIds.length === 0}
          loading={updateStatusMutation.isPending}
          onClick={async () => {
            try {
              await Promise.all(
                selectedOrderIds.map((orderId) =>
                  updateStoreOrderStatus(storeId, orderId, bulkNextStatus)
                )
              );
              msg.success(`Status atualizado em lote para ${selectedOrderIds.length} pedido(s)`);
              setSelectedOrderIds([]);
              refreshOrderData();
            } catch (error) {
              msg.error(getApiErrorMessage(error, "Falha ao atualizar status em lote"));
            }
          }}
        >
          Atualizar status em lote
        </Button>
      </Space>

      <ListState
        loading={ordersQuery.isLoading}
        isError={ordersQuery.isError}
        errorMessage={getApiErrorMessage(ordersQuery.error, "Falha ao carregar pedidos")}
        isEmpty={!ordersQuery.isLoading && !ordersQuery.isError && (ordersQuery.data?.items ?? []).length === 0}
        emptyDescription="Nenhum pedido encontrado com os filtros atuais"
        onRetry={() => ordersQuery.refetch()}
      >
        <Table<AdminOrder>
          rowKey="id"
          dataSource={ordersQuery.data?.items ?? []}
          columns={columns}
          rowSelection={{
            selectedRowKeys: selectedOrderIds,
            onChange: (keys) => setSelectedOrderIds(keys.map((key) => Number(key))),
          }}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total: ordersQuery.data?.total ?? 0,
            onChange: (nextPage) => setPage(nextPage),
          }}
        />
      </ListState>

      <Drawer
        title={selectedOrderId ? `Pedido #${selectedOrderId} - Operacao` : "Pedido"}
        width={760}
        open={!!selectedOrderId}
        onClose={() => setSelectedOrderId(null)}
      >
        {detailQuery.isError ? (
          <Alert
            type="error"
            showIcon
            message="Falha ao carregar detalhes"
            description={getApiErrorMessage(detailQuery.error)}
          />
        ) : !detailQuery.data ? (
          <Typography.Text type="secondary">Carregando...</Typography.Text>
        ) : (
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="Cliente">
                {detailQuery.data.user_name ?? detailQuery.data.recipient_name}
              </Descriptions.Item>
              <Descriptions.Item label="Email">{detailQuery.data.user_email ?? "-"}</Descriptions.Item>
              <Descriptions.Item label="Status">
                <Tag color={statusColor(detailQuery.data.status)}>{detailQuery.data.status}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Total">R$ {Number(detailQuery.data.total).toFixed(2)}</Descriptions.Item>
              <Descriptions.Item label="Endereco">
                {`${detailQuery.data.street}, ${detailQuery.data.number} - ${detailQuery.data.neighborhood}, ${detailQuery.data.city}/${detailQuery.data.state}`}
              </Descriptions.Item>
            </Descriptions>

            <Space wrap>
              <Button
                onClick={async () => {
                  try {
                    const res = await http.get(
                      `/api/v1/admin/stores/${storeId}/orders/${detailQuery.data.id}/print`,
                      { params: { kind: "label" }, responseType: "blob" }
                    );
                    const url = URL.createObjectURL(new Blob([res.data], { type: "text/html" }));
                    window.open(url, "_blank");
                  } catch (error) {
                    msg.error(getApiErrorMessage(error, "Falha ao imprimir etiqueta"));
                  }
                }}
              >
                Imprimir etiqueta
              </Button>
              <Button
                onClick={async () => {
                  try {
                    const res = await http.get(
                      `/api/v1/admin/stores/${storeId}/orders/${detailQuery.data.id}/print`,
                      { params: { kind: "receipt" }, responseType: "blob" }
                    );
                    const url = URL.createObjectURL(new Blob([res.data], { type: "text/html" }));
                    window.open(url, "_blank");
                  } catch (error) {
                    msg.error(getApiErrorMessage(error, "Falha ao imprimir comprovante"));
                  }
                }}
              >
                Imprimir comprovante
              </Button>
            </Space>

            <Card title="Itens e cancelamento parcial" size="small">
              <Table
                rowKey="id"
                pagination={false}
                dataSource={activeItems}
                columns={[
                  { title: "Produto", dataIndex: "product_name" },
                  { title: "Variante", dataIndex: "variant_label", render: (v) => v || "-" },
                  { title: "Qtd", dataIndex: "quantity", width: 70 },
                  { title: "Ja cancelada", dataIndex: "cancelled_quantity", width: 110 },
                  { title: "Qtd ativa", dataIndex: "activeQty", width: 90 },
                  {
                    title: "Cancelar agora",
                    width: 160,
                    render: (_, row) => (
                      <InputNumber
                        min={0}
                        max={row.activeQty}
                        value={cancelQtyByItem[row.id] ?? 0}
                        onChange={(value) =>
                          setCancelQtyByItem((prev) => ({
                            ...prev,
                            [row.id]: Number(value || 0),
                          }))
                        }
                      />
                    ),
                  },
                ]}
              />
              <Space style={{ marginTop: 12 }} wrap>
                <Input
                  placeholder="Motivo do cancelamento (obrigatorio)"
                  style={{ width: 360 }}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                />
                <Button
                  danger
                  loading={cancelMutation.isPending}
                  onClick={() => {
                    const items = Object.entries(cancelQtyByItem)
                      .map(([orderItemId, quantity]) => ({
                        order_item_id: Number(orderItemId),
                        quantity: Number(quantity || 0),
                      }))
                      .filter((row) => row.quantity > 0);
                    if (items.length === 0) {
                      msg.warning("Informe quantidade para pelo menos um item");
                      return;
                    }
                    cancelMutation.mutate({
                      orderId: detailQuery.data.id,
                      reason: cancelReason,
                      items,
                    });
                  }}
                >
                  Cancelar parcial
                </Button>
                <Button
                  danger
                  type="primary"
                  loading={cancelMutation.isPending}
                  onClick={() =>
                    cancelMutation.mutate({
                      orderId: detailQuery.data.id,
                      reason: cancelReason,
                    })
                  }
                >
                  Cancelar pedido inteiro
                </Button>
              </Space>
            </Card>

            <Card title="Notas internas" size="small">
              <Space.Compact style={{ width: "100%" }}>
                <Input
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  placeholder="Registrar observacao interna"
                />
                <Button
                  type="primary"
                  loading={addNoteMutation.isPending}
                  onClick={() => addNoteMutation.mutate({ orderId: detailQuery.data.id, note: noteDraft })}
                >
                  Salvar nota
                </Button>
              </Space.Compact>
            </Card>

            <Card title="Timeline do pedido" size="small">
              {timelineQuery.isError ? (
                <Alert
                  type="error"
                  showIcon
                  message="Falha ao carregar timeline"
                  description={getApiErrorMessage(timelineQuery.error)}
                />
              ) : (
                <Timeline
                  items={(timelineQuery.data?.items ?? []).map((event) => ({
                    color: event.event_type.includes("cancel") ? "red" : "blue",
                    children: (
                      <Space direction="vertical" size={2}>
                        <Typography.Text strong>
                          {event.event_type} - {new Date(event.created_at).toLocaleString("pt-BR")}
                        </Typography.Text>
                        <Typography.Text type="secondary">
                          {event.from_status ? `${event.from_status} -> ${event.to_status}` : event.to_status || "-"}
                        </Typography.Text>
                        {event.note ? <Typography.Text>{event.note}</Typography.Text> : null}
                      </Space>
                    ),
                  }))}
                />
              )}
            </Card>
          </Space>
        )}
      </Drawer>
    </Card>
  );
}
