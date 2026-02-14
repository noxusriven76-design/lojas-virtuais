import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Card, Col, Row, Select, Space, Spin, Statistic, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { getApiErrorMessage } from "../api/http";
import {
  type DashboardAlert,
  type DashboardCompare,
  type DashboardHealth,
  type DashboardKpis,
  type DashboardPeriod,
  fetchDashboardAlerts,
  fetchDashboardCompare,
  fetchDashboardHealth,
  fetchDashboardKpis,
} from "../dashboard/dashboard.api";
import { fetchMyStores } from "../stores/stores.api";
import { useCurrentStoreId } from "../stores/store.store";

const periodOptions = [
  { value: "day", label: "Dia" },
  { value: "week", label: "Semana" },
  { value: "month", label: "Mes" },
];

function formatMoney(value: number) {
  return `R$ ${Number(value || 0).toFixed(2)}`;
}

function pctColor(value: number) {
  if (value > 0) return "green";
  if (value < 0) return "red";
  return "default";
}

function healthColor(status: string) {
  if (status === "ok") return "green";
  if (status === "warning" || status === "degraded") return "gold";
  return "red";
}

function alertColor(level: string) {
  if (level === "error") return "red";
  if (level === "warning") return "gold";
  return "blue";
}

export function DashboardPage() {
  const currentStoreId = useCurrentStoreId();
  const [period, setPeriod] = useState<DashboardPeriod>("day");

  const storesQuery = useQuery({
    queryKey: ["admin", "my-stores"],
    queryFn: fetchMyStores,
  });

  const kpisQuery = useQuery({
    queryKey: ["admin", "dashboard", "kpis", currentStoreId, period],
    queryFn: () => fetchDashboardKpis(currentStoreId!, period),
    enabled: !!currentStoreId,
  });

  const compareQuery = useQuery({
    queryKey: ["admin", "dashboard", "compare", currentStoreId, period],
    queryFn: () => fetchDashboardCompare(currentStoreId!, period),
    enabled: !!currentStoreId,
  });

  const alertsQuery = useQuery({
    queryKey: ["admin", "dashboard", "alerts", currentStoreId, period],
    queryFn: () => fetchDashboardAlerts(currentStoreId!, period),
    enabled: !!currentStoreId,
  });

  const healthQuery = useQuery({
    queryKey: ["admin", "dashboard", "health", currentStoreId],
    queryFn: () => fetchDashboardHealth(currentStoreId!),
    enabled: !!currentStoreId,
    retry: false,
  });

  const selectedStore = useMemo(
    () => storesQuery.data?.find((store) => store.store_id === currentStoreId) ?? null,
    [storesQuery.data, currentStoreId]
  );

  if (storesQuery.isLoading) {
    return (
      <Card title="Dashboard" style={{ marginTop: 16 }}>
        <Spin />
      </Card>
    );
  }

  if (!storesQuery.data || storesQuery.data.length === 0) {
    return (
      <Card title="Dashboard" style={{ marginTop: 16 }}>
        <Alert
          type="warning"
          showIcon
          message="Nenhuma loja associada ao usuario"
          description="Voce nao possui lojas para administrar."
        />
      </Card>
    );
  }

  if (!currentStoreId || !selectedStore) {
    return (
      <Card title="Dashboard" style={{ marginTop: 16 }}>
        <Alert type="info" showIcon message="Selecione uma loja para visualizar os indicadores." />
      </Card>
    );
  }

  const kpis: DashboardKpis | undefined = kpisQuery.data;
  const compare: DashboardCompare | undefined = compareQuery.data;
  const alerts: DashboardAlert[] = alertsQuery.data?.items ?? [];
  const health: DashboardHealth | undefined = healthQuery.data;

  const compareRows = compare
    ? [
        {
          key: "revenue",
          metric: "Faturamento",
          current: formatMoney(compare.revenue.current),
          previous: formatMoney(compare.revenue.previous),
          change: compare.revenue.change_pct,
        },
        {
          key: "orders",
          metric: "Pedidos",
          current: Number(compare.orders.current).toFixed(0),
          previous: Number(compare.orders.previous).toFixed(0),
          change: compare.orders.change_pct,
        },
        {
          key: "ticket",
          metric: "Ticket medio",
          current: formatMoney(compare.average_ticket.current),
          previous: formatMoney(compare.average_ticket.previous),
          change: compare.average_ticket.change_pct,
        },
      ]
    : [];

  const compareColumns: ColumnsType<(typeof compareRows)[number]> = [
    { title: "Metrica", dataIndex: "metric" },
    { title: "Atual", dataIndex: "current", width: 160 },
    { title: "Anterior", dataIndex: "previous", width: 160 },
    {
      title: "Variacao",
      dataIndex: "change",
      width: 130,
      render: (value: number) => <Tag color={pctColor(value)}>{value.toFixed(2)}%</Tag>,
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: "100%", marginTop: 16 }}>
      <Card
        title="Dashboard Executivo"
        extra={
          <Select
            style={{ width: 140 }}
            value={period}
            onChange={(value) => setPeriod(value)}
            options={periodOptions}
          />
        }
      >
        <Typography.Paragraph className="dashboard-store-line">
          <strong>Loja:</strong> {selectedStore.name} (#{selectedStore.store_id})
        </Typography.Paragraph>

        {(kpisQuery.isError || compareQuery.isError || alertsQuery.isError || healthQuery.isError) && (
          <Alert
            style={{ marginBottom: 16 }}
            type="error"
            showIcon
            message="Falha ao carregar dados executivos"
            description={getApiErrorMessage(
              kpisQuery.error ?? compareQuery.error ?? alertsQuery.error ?? healthQuery.error
            )}
          />
        )}

        <Row gutter={16}>
          <Col xs={24} md={8}>
            <Card size="small">
              <Statistic title="Faturamento" value={kpis ? formatMoney(kpis.revenue) : "-"} />
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card size="small">
              <Statistic title="Ticket medio" value={kpis ? formatMoney(kpis.average_ticket) : "-"} />
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card size="small">
              <Statistic title="Pedidos" value={kpis?.orders_total ?? 0} />
            </Card>
          </Col>
        </Row>

        <Row gutter={16} style={{ marginTop: 8 }}>
          <Col xs={24} md={8}>
            <Card size="small">
              <Statistic title="Conversao (proxy)" value={kpis?.conversion_rate ?? 0} suffix="%" precision={2} />
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card size="small">
              <Statistic title="Abandono (proxy)" value={kpis?.abandonment_rate ?? 0} suffix="%" precision={2} />
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card size="small">
              <Statistic
                title="Ruptura de estoque"
                value={kpis ? `${kpis.stockout_count} (${kpis.stockout_rate.toFixed(2)}%)` : "-"}
              />
            </Card>
          </Col>
        </Row>
      </Card>

      <Card title="Comparativo por periodo">
        <Table
          rowKey="key"
          loading={compareQuery.isLoading}
          dataSource={compareRows}
          columns={compareColumns}
          pagination={false}
        />
      </Card>

      <Card title="Alertas operacionais">
        {alertsQuery.isLoading ? (
          <Spin />
        ) : (
          <Space direction="vertical" style={{ width: "100%" }}>
            {alerts.map((alert) => (
              <Alert key={alert.key} showIcon type={alert.level === "error" ? "error" : alert.level === "warning" ? "warning" : "info"} message={alert.title} description={alert.detail} />
            ))}
          </Space>
        )}
      </Card>

      <Card title="Status interno (API/DB/Jobs)">
        {healthQuery.isLoading ? (
          <Spin />
        ) : (
          <Space size={16} wrap>
            <Tag color={healthColor(health?.api ?? "error")}>API: {health?.api ?? "error"}</Tag>
            <Tag color={healthColor(health?.database ?? "error")}>DB: {health?.database ?? "error"}</Tag>
            <Tag color={healthColor(health?.jobs ?? "error")}>JOBS: {health?.jobs ?? "error"}</Tag>
            <Typography.Text type="secondary">
              Ultima verificacao: {health?.checked_at ? new Date(health.checked_at).toLocaleString("pt-BR") : "-"}
            </Typography.Text>
          </Space>
        )}
      </Card>
    </Space>
  );
}
