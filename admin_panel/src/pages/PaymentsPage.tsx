import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Card, Input, Select, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { Link, useNavigate } from "react-router-dom";
import { getApiErrorMessage } from "../api/http";
import { PageFilterBar } from "../components/ui/PageFilterBar";
import { ListState } from "../components/ui/ListState";
import { type PaymentTransaction, fetchStorePayments } from "../payments/payments.api";
import { useCurrentStoreId } from "../stores/store.store";

const PAGE_SIZE = 20;

const paymentStatusOptions = [
  "pending",
  "authorized",
  "paid",
  "failed",
  "cancelled",
  "partially_refunded",
  "refunded",
].map((value) => ({ value, label: value }));

function statusColor(status: string) {
  if (status === "paid") return "green";
  if (status === "authorized") return "blue";
  if (status === "partially_refunded") return "orange";
  if (status === "refunded") return "purple";
  if (status === "failed" || status === "cancelled") return "red";
  return "gold";
}

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: currency || "BRL" }).format(value || 0);
}

export function PaymentsPage() {
  const storeId = useCurrentStoreId();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [provider, setProvider] = useState("");
  const [method, setMethod] = useState("");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const offset = (page - 1) * PAGE_SIZE;

  const paymentsQuery = useQuery({
    queryKey: [
      "admin",
      "payments",
      storeId,
      PAGE_SIZE,
      offset,
      status || "",
      provider,
      method,
      search,
      dateFrom,
      dateTo,
    ],
    queryFn: () =>
      fetchStorePayments(storeId!, {
        limit: PAGE_SIZE,
        offset,
        status,
        provider: provider || undefined,
        method: method || undefined,
        q: search || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      }),
    enabled: !!storeId,
  });

  const columns: ColumnsType<PaymentTransaction> = [
    { title: "ID", dataIndex: "id", width: 90 },
    {
      title: "Pedido",
      dataIndex: "order_id",
      width: 100,
      render: (value: number) => <Link to="/orders">#{value}</Link>,
    },
    {
      title: "Status",
      dataIndex: "status",
      width: 170,
      render: (value: string) => <Tag color={statusColor(value)}>{value}</Tag>,
    },
    {
      title: "Valor",
      key: "amount",
      width: 140,
      render: (_, row) => formatMoney(row.amount, row.currency),
    },
    {
      title: "Metodo",
      dataIndex: "method",
      width: 130,
      render: (value: string | null) => value || "-",
    },
    {
      title: "Cliente",
      key: "customer",
      render: (_, row) =>
        row.customer_name ? (
          <Space direction="vertical" size={0}>
            <Typography.Text>{row.customer_name}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {row.customer_email || "-"}
            </Typography.Text>
          </Space>
        ) : (
          <Typography.Text type="secondary">-</Typography.Text>
        ),
      width: 160,
    },
    {
      title: "Data",
      dataIndex: "created_at",
      width: 180,
      render: (value: string) => new Date(value).toLocaleString("pt-BR"),
    },
    {
      title: "Acoes",
      key: "actions",
      width: 130,
      render: (_, row) => (
        <Button size="small" type="primary" onClick={() => navigate(`/finance/payments/${row.id}`)}>
          Detalhar
        </Button>
      ),
    },
  ];

  if (!storeId) {
    return (
      <Card title="Pagamentos" style={{ marginTop: 16 }}>
        <Alert type="info" showIcon message="Selecione uma loja para visualizar pagamentos." />
      </Card>
    );
  }

  return (
    <Card title="Pagamentos" style={{ marginTop: 16 }}>
      <Typography.Paragraph>
        <strong>store_id atual:</strong> {storeId}
      </Typography.Paragraph>

      <PageFilterBar>
        <Select
          allowClear
          placeholder="Status"
          style={{ width: 190 }}
          options={paymentStatusOptions}
          value={status}
          onChange={(value) => {
            setPage(1);
            setStatus(value);
          }}
        />
        <Input
          placeholder="Provider"
          style={{ width: 150 }}
          allowClear
          value={provider}
          onChange={(e) => {
            setPage(1);
            setProvider(e.target.value);
          }}
        />
        <Input
          placeholder="Metodo"
          style={{ width: 150 }}
          allowClear
          value={method}
          onChange={(e) => {
            setPage(1);
            setMethod(e.target.value);
          }}
        />
        <Input
          placeholder="Busca (ID, pedido, provider)"
          style={{ width: 260 }}
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
            setStatus(undefined);
            setProvider("");
            setMethod("");
            setSearch("");
            setDateFrom("");
            setDateTo("");
          }}
        >
          Limpar
        </Button>
      </PageFilterBar>

      <Space style={{ marginBottom: 12 }}>
        <Button onClick={() => navigate("/finance/reconciliation")}>Ir para conciliacao</Button>
      </Space>

      <ListState
        loading={paymentsQuery.isLoading}
        isError={paymentsQuery.isError}
        errorMessage={getApiErrorMessage(paymentsQuery.error, "Falha ao carregar pagamentos")}
        isEmpty={!paymentsQuery.isLoading && !paymentsQuery.isError && (paymentsQuery.data?.items ?? []).length === 0}
        emptyDescription="Nenhum pagamento encontrado para os filtros informados"
        onRetry={() => paymentsQuery.refetch()}
      >
        <Table<PaymentTransaction>
          rowKey="id"
          dataSource={paymentsQuery.data?.items ?? []}
          columns={columns}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total: paymentsQuery.data?.total ?? 0,
            onChange: (nextPage) => setPage(nextPage),
          }}
        />
      </ListState>
    </Card>
  );
}
