import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Card, Input, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { getApiErrorMessage } from "../api/http";
import { type Customer, fetchCustomers } from "../customers/customers.api";
import { PageFilterBar } from "../components/ui/PageFilterBar";
import { ListState } from "../components/ui/ListState";
import { useCurrentStoreId } from "../stores/store.store";

const PAGE_SIZE = 20;

export function CustomersPage() {
  const storeId = useCurrentStoreId();
  const [msg, contextHolder] = message.useMessage();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const offset = (page - 1) * PAGE_SIZE;

  const customersQuery = useQuery({
    queryKey: ["admin", "customers", storeId, PAGE_SIZE, offset, search],
    queryFn: () =>
      fetchCustomers(storeId!, {
        limit: PAGE_SIZE,
        offset,
        q: search.trim() || undefined,
      }),
    enabled: !!storeId,
  });

  const columns: ColumnsType<Customer> = [
    { title: "ID", dataIndex: "id", width: 90 },
    { title: "Nome", dataIndex: "name" },
    { title: "Email", dataIndex: "email", render: (value) => value ?? "-" },
    { title: "Telefone", dataIndex: "phone", render: (value) => value ?? "-" },
    {
      title: "Criado em",
      dataIndex: "created_at",
      width: 200,
      render: (value) => (value ? new Date(value).toLocaleString("pt-BR") : "-"),
    },
    {
      title: "Pedidos",
      dataIndex: "total_orders",
      width: 100,
      render: (value: number) => <Tag color="blue">{value}</Tag>,
    },
  ];

  if (!storeId) {
    return (
      <Card title="Clientes" style={{ marginTop: 16 }}>
        <Alert type="info" showIcon message="Selecione uma loja para ver os clientes." />
      </Card>
    );
  }

  return (
    <Card title="Clientes" style={{ marginTop: 16 }}>
      {contextHolder}
      <Typography.Paragraph>
        <strong>store_id atual:</strong> {storeId}
      </Typography.Paragraph>

      <PageFilterBar>
        <Input
          placeholder="Buscar por nome, email ou telefone"
          value={search}
          allowClear
          style={{ width: 320 }}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
        />
        <Button
          onClick={() => {
            setPage(1);
            setSearch("");
          }}
        >
          Limpar
        </Button>
        <Button
          onClick={async () => {
            const rows = customersQuery.data?.items ?? [];
            const emails = rows.map((row) => row.email).filter((value): value is string => !!value);
            if (!emails.length) {
              msg.warning("Nenhum email na pagina atual para copiar");
              return;
            }
            await navigator.clipboard.writeText(emails.join("; "));
            msg.success("Emails copiados da pagina atual");
          }}
        >
          Copiar emails da pagina
        </Button>
      </PageFilterBar>

      <ListState
        loading={customersQuery.isLoading}
        isError={customersQuery.isError}
        errorMessage={getApiErrorMessage(customersQuery.error, "Falha ao carregar clientes")}
        isEmpty={!customersQuery.isLoading && !customersQuery.isError && (customersQuery.data?.items ?? []).length === 0}
        emptyDescription="Nenhum cliente encontrado com os filtros atuais"
        onRetry={() => customersQuery.refetch()}
      >
        <Table<Customer>
          rowKey="id"
          dataSource={customersQuery.data?.items ?? []}
          columns={columns}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total: customersQuery.data?.total ?? 0,
            onChange: (nextPage) => setPage(nextPage),
          }}
        />
      </ListState>
    </Card>
  );
}
