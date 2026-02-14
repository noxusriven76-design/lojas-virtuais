import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Card, Input, Space, Table, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { getApiErrorMessage } from "../api/http";
import { type AuditLogRow, exportAuditLogsCsv, fetchAuditLogs } from "../audit/audit.api";
import { useCurrentStoreId } from "../stores/store.store";

const PAGE_SIZE = 25;

export function AuditLogsPage() {
  const storeId = useCurrentStoreId();
  const [msg, contextHolder] = message.useMessage();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const offset = (page - 1) * PAGE_SIZE;
  const query = useQuery({
    queryKey: [
      "admin",
      "audit-logs",
      storeId,
      PAGE_SIZE,
      offset,
      search,
      action,
      entityType,
      dateFrom,
      dateTo,
    ],
    queryFn: () =>
      fetchAuditLogs(storeId!, {
        limit: PAGE_SIZE,
        offset,
        q: search || undefined,
        action: action || undefined,
        entity_type: entityType || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      }),
    enabled: !!storeId,
  });

  const columns: ColumnsType<AuditLogRow> = [
    {
      title: "Quando",
      dataIndex: "created_at",
      width: 180,
      render: (value: string) => new Date(value).toLocaleString("pt-BR"),
    },
    { title: "Usuario", dataIndex: "user_email", width: 220, render: (value) => value || "-" },
    { title: "Acao", dataIndex: "action", width: 180 },
    { title: "Entidade", dataIndex: "entity_type", width: 140 },
    { title: "ID", dataIndex: "entity_id", width: 100, render: (value) => value || "-" },
    { title: "Metodo", dataIndex: "request_method", width: 90, render: (value) => value || "-" },
    { title: "Rota", dataIndex: "request_path", render: (value) => value || "-" },
  ];

  if (!storeId) {
    return (
      <Card title="Auditoria" style={{ marginTop: 16 }}>
        <Alert type="info" showIcon message="Selecione uma loja para consultar a trilha de auditoria." />
      </Card>
    );
  }

  return (
    <Card
      title="Auditoria"
      style={{ marginTop: 16 }}
      extra={
        <Button
          onClick={async () => {
            try {
              await exportAuditLogsCsv(storeId, {
                q: search || undefined,
                action: action || undefined,
                entity_type: entityType || undefined,
                date_from: dateFrom || undefined,
                date_to: dateTo || undefined,
              });
            } catch (error) {
              msg.error(getApiErrorMessage(error, "Falha ao exportar CSV"));
            }
          }}
        >
          Exportar CSV
        </Button>
      }
    >
      {contextHolder}
      <Typography.Paragraph>
        <strong>store_id atual:</strong> {storeId}
      </Typography.Paragraph>
      <Space wrap style={{ marginBottom: 16 }}>
        <Input
          placeholder="Buscar por usuario/acao/rota"
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
          style={{ width: 260 }}
          allowClear
        />
        <Input
          placeholder="Acao exata (ex: product.update)"
          value={action}
          onChange={(e) => {
            setPage(1);
            setAction(e.target.value);
          }}
          style={{ width: 230 }}
          allowClear
        />
        <Input
          placeholder="Entidade (ex: product)"
          value={entityType}
          onChange={(e) => {
            setPage(1);
            setEntityType(e.target.value);
          }}
          style={{ width: 190 }}
          allowClear
        />
        <Input
          placeholder="Data inicial (YYYY-MM-DD)"
          value={dateFrom}
          onChange={(e) => {
            setPage(1);
            setDateFrom(e.target.value);
          }}
          style={{ width: 190 }}
        />
        <Input
          placeholder="Data final (YYYY-MM-DD)"
          value={dateTo}
          onChange={(e) => {
            setPage(1);
            setDateTo(e.target.value);
          }}
          style={{ width: 190 }}
        />
      </Space>

      {query.isError ? (
        <Alert
          type="error"
          showIcon
          message="Falha ao carregar auditoria"
          description={getApiErrorMessage(query.error)}
        />
      ) : (
        <Table<AuditLogRow>
          rowKey="id"
          loading={query.isLoading}
          dataSource={query.data?.items ?? []}
          columns={columns}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total: query.data?.total ?? 0,
            onChange: (nextPage) => setPage(nextPage),
          }}
          expandable={{
            expandedRowRender: (row) => (
              <Space direction="vertical" style={{ width: "100%" }}>
                <Typography.Text strong>Antes</Typography.Text>
                <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                  {JSON.stringify(row.before_data ?? {}, null, 2)}
                </pre>
                <Typography.Text strong>Depois</Typography.Text>
                <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                  {JSON.stringify(row.after_data ?? {}, null, 2)}
                </pre>
              </Space>
            ),
          }}
        />
      )}
    </Card>
  );
}
