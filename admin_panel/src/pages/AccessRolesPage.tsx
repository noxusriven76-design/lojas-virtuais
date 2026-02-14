import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Card, Form, InputNumber, Popconfirm, Select, Space, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { getApiErrorMessage } from "../api/http";
import { hasStorePermission } from "../authz/permissions";
import { fetchMyStores } from "../stores/stores.api";
import { useCurrentStoreId } from "../stores/store.store";
import {
  addStoreMember,
  fetchAdminUsers,
  fetchStoreMembers,
  removeStoreMember,
  type StoreMember,
  updateStoreMemberRole,
} from "../access/access.api";
import { fetchMe } from "../auth/auth.api";

const roleOptions = [
  { value: "admin_loja", label: "admin_loja" },
  { value: "operador_pedidos", label: "operador_pedidos" },
  { value: "editor_conteudo", label: "editor_conteudo" },
  { value: "suporte", label: "suporte" },
];

type AddMemberForm = {
  user_id?: number;
  role: string;
};

export function AccessRolesPage() {
  const storeId = useCurrentStoreId();
  const queryClient = useQueryClient();
  const [msg, contextHolder] = message.useMessage();
  const [form] = Form.useForm<AddMemberForm>();
  const [editingRoleByUser, setEditingRoleByUser] = useState<Record<number, string>>({});

  const meQuery = useQuery({ queryKey: ["auth", "me"], queryFn: fetchMe });
  const myStoresQuery = useQuery({ queryKey: ["admin", "my-stores"], queryFn: fetchMyStores });
  const canManage = hasStorePermission(
    myStoresQuery.data,
    storeId,
    "members.write",
    !!meQuery.data?.is_superuser,
  );

  const membersQuery = useQuery({
    queryKey: ["admin", "store-members", storeId],
    queryFn: () => fetchStoreMembers(storeId!),
    enabled: !!storeId && hasStorePermission(myStoresQuery.data, storeId, "members.read", !!meQuery.data?.is_superuser),
  });

  const usersQuery = useQuery({
    queryKey: ["admin", "users"],
    queryFn: fetchAdminUsers,
    enabled: !!meQuery.data?.is_superuser,
    retry: false,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["admin", "store-members", storeId] });
    queryClient.invalidateQueries({ queryKey: ["admin", "my-stores"] });
  };

  const addMutation = useMutation({
    mutationFn: (payload: AddMemberForm) => addStoreMember(storeId!, Number(payload.user_id), payload.role),
    onSuccess: () => {
      msg.success("Membro adicionado");
      form.resetFields();
      refresh();
    },
    onError: (e) => msg.error(getApiErrorMessage(e, "Falha ao adicionar membro")),
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: number; role: string }) => updateStoreMemberRole(storeId!, userId, role),
    onSuccess: () => {
      msg.success("Papel atualizado");
      refresh();
    },
    onError: (e) => msg.error(getApiErrorMessage(e, "Falha ao atualizar papel")),
  });

  const removeMutation = useMutation({
    mutationFn: (userId: number) => removeStoreMember(storeId!, userId),
    onSuccess: () => {
      msg.success("Membro removido");
      refresh();
    },
    onError: (e) => msg.error(getApiErrorMessage(e, "Falha ao remover membro")),
  });

  const userOptions = useMemo(
    () =>
      (usersQuery.data ?? []).map((u) => ({
        value: u.id,
        label: `${u.name || "(sem nome)"} - ${u.email}`,
      })),
    [usersQuery.data],
  );

  const columns: ColumnsType<StoreMember> = [
    { title: "User ID", dataIndex: "user_id", width: 90 },
    {
      title: "Usuario",
      key: "user",
      render: (_, row) => row.user?.email ?? row.user?.name ?? "-",
    },
    {
      title: "Papel",
      key: "role",
      render: (_, row) => <Tag color="blue">{row.role}</Tag>,
    },
    {
      title: "Alterar papel",
      key: "change_role",
      width: 280,
      render: (_, row) => (
        <Space>
          <Select
            size="small"
            style={{ minWidth: 170 }}
            options={roleOptions}
            value={editingRoleByUser[row.user_id] ?? row.role}
            onChange={(value) =>
              setEditingRoleByUser((prev) => ({
                ...prev,
                [row.user_id]: value,
              }))
            }
            disabled={!canManage}
          />
          <Button
            size="small"
            type="primary"
            disabled={!canManage}
            loading={updateRoleMutation.isPending}
            onClick={() =>
              updateRoleMutation.mutate({
                userId: row.user_id,
                role: editingRoleByUser[row.user_id] ?? row.role,
              })
            }
          >
            Salvar
          </Button>
        </Space>
      ),
    },
    {
      title: "Acoes",
      key: "actions",
      width: 120,
      render: (_, row) => (
        <Popconfirm title="Remover membro desta loja?" onConfirm={() => removeMutation.mutate(row.user_id)}>
          <Button size="small" danger disabled={!canManage} loading={removeMutation.isPending}>
            Remover
          </Button>
        </Popconfirm>
      ),
    },
  ];

  if (!storeId) {
    return (
      <Card title="Usuarios e papeis" style={{ marginTop: 16 }}>
        <Alert type="info" showIcon message="Selecione uma loja para gerenciar papeis." />
      </Card>
    );
  }

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      {contextHolder}
      {!hasStorePermission(myStoresQuery.data, storeId, "members.read", !!meQuery.data?.is_superuser) ? (
        <Alert type="warning" showIcon message="Voce nao tem permissao para visualizar membros desta loja." />
      ) : null}

      <Card title="Adicionar membro">
        <Form<AddMemberForm>
          form={form}
          layout="inline"
          initialValues={{ role: "suporte" }}
          onFinish={(values) => addMutation.mutate(values)}
        >
          {meQuery.data?.is_superuser ? (
            <Form.Item name="user_id" label="Usuario" rules={[{ required: true, message: "Informe o usuario" }]}>
              <Select style={{ minWidth: 340 }} options={userOptions} placeholder="Selecione o usuario" />
            </Form.Item>
          ) : (
            <Form.Item
              name="user_id"
              label="User ID"
              rules={[{ required: true, message: "Informe o user_id" }]}
            >
              <InputNumber min={1} />
            </Form.Item>
          )}
          <Form.Item name="role" label="Papel" rules={[{ required: true, message: "Informe o papel" }]}>
            <Select style={{ minWidth: 180 }} options={roleOptions} />
          </Form.Item>
          <Button type="primary" htmlType="submit" disabled={!canManage} loading={addMutation.isPending}>
            Adicionar
          </Button>
        </Form>
      </Card>

      <Card title="Membros da loja">
        {membersQuery.isError ? (
          <Alert type="error" showIcon message="Falha ao carregar membros" description={getApiErrorMessage(membersQuery.error)} />
        ) : (
          <Table<StoreMember>
            rowKey={(r) => `${r.store_id}-${r.user_id}`}
            loading={membersQuery.isLoading}
            dataSource={membersQuery.data ?? []}
            columns={columns}
            pagination={false}
          />
        )}
      </Card>
    </Space>
  );
}

