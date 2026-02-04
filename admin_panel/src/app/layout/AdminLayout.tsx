import { Alert, Button, Layout, Menu, Spin, Typography } from "antd";
import { useQuery } from "@tanstack/react-query";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { fetchMe } from "../../auth/auth.api";
import { authStore } from "../../auth/auth.store";
import { fetchMyStores } from "../../stores/stores.api";
import { storeStore } from "../../stores/store.store";
import { StoreSwitcher } from "./StoreSwitcher";

const { Header, Sider, Content } = Layout;

const menuItems = [
  { key: "/", label: <Link to="/">Dashboard</Link> },
  {
    key: "catalog",
    label: "Catálogo",
    children: [
      { key: "/catalog/categories", label: <Link to="/catalog/categories">Categorias</Link> },
      { key: "/catalog/products", label: <Link to="/catalog/products">Produtos</Link> },
    ],
  },
  { key: "/customers", label: <Link to="/customers">Clientes</Link> },
  { key: "/settings", label: <Link to="/settings">Configurações</Link> },
];

function selectedMenuKey(pathname: string) {
  if (pathname.startsWith("/catalog/categories")) return "/catalog/categories";
  if (pathname.startsWith("/catalog/products")) return "/catalog/products";
  if (pathname.startsWith("/customers")) return "/customers";
  if (pathname.startsWith("/settings")) return "/settings";
  return "/";
}

export function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();

  const meQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: fetchMe,
    retry: false,
  });

  const storesQuery = useQuery({
    queryKey: ["admin", "my-stores"],
    queryFn: fetchMyStores,
    enabled: meQuery.isSuccess,
    retry: false,
  });

  if (meQuery.isSuccess && authStore.getUser()?.id !== meQuery.data.id) {
    authStore.setUser(meQuery.data);
  }

  if (storesQuery.isSuccess) {
    const stores = storesQuery.data;
    storeStore.validateCurrentStoreId(stores);
    if (!storeStore.getCurrentStoreId() && stores.length > 0) {
      storeStore.setCurrentStoreId(stores[0].store_id);
    }
  }

  const onLogout = () => {
    authStore.logout();
    navigate("/login", { replace: true });
  };

  const loading = meQuery.isLoading || storesQuery.isLoading;
  const hasError = meQuery.isError || storesQuery.isError;

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider width={240} theme="light">
        <div className="brand">Admin Panel</div>
        <Menu
          mode="inline"
          selectedKeys={[selectedMenuKey(location.pathname)]}
          defaultOpenKeys={["catalog"]}
          items={menuItems}
        />
      </Sider>
      <Layout>
        <Header className="admin-header">
          <StoreSwitcher
            stores={storesQuery.data ?? []}
            currentStoreId={storeStore.getCurrentStoreId()}
            onChange={(id) => storeStore.setCurrentStoreId(id)}
            disabled={loading || hasError}
          />
          <Button onClick={onLogout}>Logout</Button>
        </Header>
        <Content className="admin-content">
          {loading ? (
            <div className="centered">
              <Spin />
            </div>
          ) : hasError ? (
            <Alert
              type="error"
              showIcon
              message="Falha ao carregar sessão"
              description="Tente atualizar a página."
            />
          ) : (
            <>
              {storesQuery.data && storesQuery.data.length === 0 ? (
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginBottom: 16 }}
                  message="Nenhuma loja associada ao usuário"
                  description="Peça acesso a uma loja para usar o painel."
                />
              ) : null}
              <Typography.Text type="secondary">
                Usuário: {authStore.getUser()?.email}
              </Typography.Text>
              <Outlet />
            </>
          )}
        </Content>
      </Layout>
    </Layout>
  );
}

