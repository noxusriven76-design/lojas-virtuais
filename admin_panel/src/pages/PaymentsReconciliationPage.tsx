import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Card, Input, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useNavigate } from "react-router-dom";
import { getApiErrorMessage } from "../api/http";
import { PageFilterBar } from "../components/ui/PageFilterBar";
import { ListState } from "../components/ui/ListState";
import {
  type PaymentReconciliationItem,
  fetchStorePaymentsReconciliation,
} from "../payments/payments.api";
import { useCurrentStoreId } from "../stores/store.store";

const PAGE_SIZE = 30;

function discrepancyColor(type: string) {
  if (type === "missing_payment") return "red";
  if (type === "amount_mismatch") return "orange";
  if (type === "status_mismatch") return "gold";
  return "default";
}

function formatMoney(value: number | null) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

export function PaymentsReconciliationPage() {
  const storeId = useCurrentStoreId();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const offset = (page - 1) * PAGE_SIZE;

  const reconciliationQuery = useQuery({
    queryKey: ["admin", "payments", "reconciliation", storeId, PAGE_SIZE, offset, dateFrom, dateTo],
    queryFn: () =>
      fetchStorePaymentsReconciliation(storeId!, {
        limit: PAGE_SIZE,
        offset,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      }),
    enabled: !!storeId,
  });

  const columns: ColumnsType<PaymentReconciliationItem> = [
    {
      title: "Pedido",
      dataIndex: "order_id",
      width: 100,
      render: (value: number) => <Button type="link" onClick={() => navigate("/orders")}>#{value}</Button>,
    },
    {
      title: "Pagamento",
      dataIndex: "payment_transaction_id",
      width: 120,
      render: (value: number | null) =>
        value ? (
          <Button type="link" onClick={() => navigate(`/finance/payments/${value}`)}>
            #{value}
          </Button>
        ) : (
          "-"
        ),
    },
    {
      title: "Divergencia",
      dataIndex: "discrepancy_type",
      width: 180,
      render: (value: string) => <Tag color={discrepancyColor(value)}>{value}</Tag>,
    },
    {
      title: "Total pedido",
      dataIndex: "order_total",
      width: 130,
      render: (value: number) => formatMoney(value),
    },
    {
      title: "Valor pagamento",
      dataIndex: "payment_amount",
      width: 140,
      render: (value: number | null) => (value === null ? "-" : formatMoney(value)),
    },
    {
      title: "Status",
      key: "status_pair",
      width: 240,
      render: (_, row) => `${row.order_status} / ${row.payment_status || "-"}`,
    },
    {
      title: "Detalhe",
      dataIndex: "detail",
    },
  ];

  if (!storeId) {
    return (
      <Card title="Conciliacao" style={{ marginTop: 16 }}>
        <Alert type="info" showIcon message="Selecione uma loja para executar a conciliacao." />
      </Card>
    );
  }

  return (
    <Card title="Conciliacao de pagamentos" style={{ marginTop: 16 }}>
      <Typography.Paragraph>
        <strong>store_id atual:</strong> {storeId}
      </Typography.Paragraph>

      <PageFilterBar>
        <Input
          placeholder="Data inicial (YYYY-MM-DD)"
          style={{ width: 220 }}
          value={dateFrom}
          onChange={(e) => {
            setPage(1);
            setDateFrom(e.target.value);
          }}
        />
        <Input
          placeholder="Data final (YYYY-MM-DD)"
          style={{ width: 220 }}
          value={dateTo}
          onChange={(e) => {
            setPage(1);
            setDateTo(e.target.value);
          }}
        />
        <Button
          onClick={() => {
            setPage(1);
            setDateFrom("");
            setDateTo("");
          }}
        >
          Limpar
        </Button>
      </PageFilterBar>

      <Space style={{ marginBottom: 12 }}>
        <Button onClick={() => navigate("/finance/payments")}>Voltar para pagamentos</Button>
      </Space>

      <ListState
        loading={reconciliationQuery.isLoading}
        isError={reconciliationQuery.isError}
        errorMessage={getApiErrorMessage(reconciliationQuery.error, "Falha ao carregar conciliacao")}
        isEmpty={
          !reconciliationQuery.isLoading &&
          !reconciliationQuery.isError &&
          (reconciliationQuery.data?.items ?? []).length === 0
        }
        emptyDescription="Nenhuma divergencia encontrada para o periodo"
        onRetry={() => reconciliationQuery.refetch()}
      >
        <Table<PaymentReconciliationItem>
          rowKey={(row) => `${row.order_id}-${row.payment_transaction_id ?? "none"}-${row.discrepancy_type}`}
          dataSource={reconciliationQuery.data?.items ?? []}
          columns={columns}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total: reconciliationQuery.data?.total ?? 0,
            onChange: (nextPage) => setPage(nextPage),
          }}
        />
      </ListState>
    </Card>
  );
}
