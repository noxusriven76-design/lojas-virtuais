import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AppstoreOutlined,
  DollarOutlined,
  DatabaseOutlined,
  FieldTimeOutlined,
  HomeOutlined,
  SearchOutlined,
  ThunderboltOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SettingOutlined,
  ShoppingCartOutlined,
  ShopOutlined,
  TagsOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { Alert, Breadcrumb, Button, Drawer, Dropdown, Input, Layout, Menu, Space, Spin, Tag, Typography } from "antd";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { fetchMe } from "../../auth/auth.api";
import { hasStorePermission } from "../../authz/permissions";
import { authStore } from "../../auth/auth.store";
import { fetchMyStores } from "../../stores/stores.api";
import { storeStore, useCurrentStoreId } from "../../stores/store.store";
import { StoreSwitcher } from "./StoreSwitcher";
import { fetchGlobalSearch } from "../../search/global-search.api";
import { ListState } from "../../components/ui/ListState";

const { Header, Sider, Content } = Layout;

const menuItems = [
  { key: "/", icon: <HomeOutlined />, label: <Link to="/">Dashboard</Link> },
  {
    key: "catalog",
    icon: <AppstoreOutlined />,
    label: "Catalogo",
    children: [
      {
        key: "/catalog/categories",
        icon: <TagsOutlined />,
        label: <Link to="/catalog/categories">Categorias</Link>,
      },
      {
        key: "/catalog/products",
        icon: <DatabaseOutlined />,
        label: <Link to="/catalog/products">Produtos</Link>,
      },
    ],
  },
  { type: "divider" as const },
  { key: "/orders", icon: <ShoppingCartOutlined />, label: <Link to="/orders">Pedidos</Link> },
  {
    key: "finance",
    icon: <DollarOutlined />,
    label: "Financeiro",
    children: [
      {
        key: "/finance/payments",
        icon: <DatabaseOutlined />,
        label: <Link to="/finance/payments">Pagamentos</Link>,
      },
      {
        key: "/finance/payment-methods",
        icon: <SettingOutlined />,
        label: <Link to="/finance/payment-methods">Formas de pagamento</Link>,
      },
      {
        key: "/finance/reconciliation",
        icon: <FieldTimeOutlined />,
        label: <Link to="/finance/reconciliation">Conciliacao</Link>,
      },
    ],
  },
  { key: "/customers", icon: <TeamOutlined />, label: <Link to="/customers">Clientes</Link> },
  { key: "/content", icon: <AppstoreOutlined />, label: <Link to="/content">Conteudo</Link> },
  { type: "divider" as const },
  { key: "/stores", icon: <ShopOutlined />, label: <Link to="/stores">Lojas</Link> },
  { key: "/access/roles", icon: <TeamOutlined />, label: <Link to="/access/roles">Usuarios e papeis</Link> },
  { key: "/audit/logs", icon: <DatabaseOutlined />, label: <Link to="/audit/logs">Auditoria</Link> },
  { key: "/settings", icon: <SettingOutlined />, label: <Link to="/settings">Configuracoes</Link> },
];

function selectedMenuKey(pathname: string) {
  if (pathname.startsWith("/catalog/categories")) return "/catalog/categories";
  if (pathname.startsWith("/catalog/products")) return "/catalog/products";
  if (pathname.startsWith("/orders")) return "/orders";
  if (pathname.startsWith("/finance/payments")) return "/finance/payments";
  if (pathname.startsWith("/finance/payment-methods")) return "/finance/payment-methods";
  if (pathname.startsWith("/finance/reconciliation")) return "/finance/reconciliation";
  if (pathname.startsWith("/content")) return "/content";
  if (pathname.startsWith("/stores")) return "/stores";
  if (pathname.startsWith("/access/roles")) return "/access/roles";
  if (pathname.startsWith("/audit/logs")) return "/audit/logs";
  if (pathname.startsWith("/customers")) return "/customers";
  if (pathname.startsWith("/settings")) return "/settings";
  return "/";
}

const routeMeta: Array<{ test: (pathname: string) => boolean; title: string; section: string }> = [
  { test: (p) => p === "/", title: "Dashboard", section: "Visao geral" },
  { test: (p) => p.startsWith("/catalog/categories"), title: "Categorias", section: "Catalogo" },
  { test: (p) => p.startsWith("/catalog/products"), title: "Produtos", section: "Catalogo" },
  { test: (p) => p.startsWith("/orders"), title: "Pedidos", section: "Vendas" },
  { test: (p) => p.startsWith("/finance/payments"), title: "Pagamentos", section: "Financeiro" },
  { test: (p) => p.startsWith("/finance/payment-methods"), title: "Formas de pagamento", section: "Financeiro" },
  { test: (p) => p.startsWith("/finance/reconciliation"), title: "Conciliacao", section: "Financeiro" },
  { test: (p) => p.startsWith("/customers"), title: "Clientes", section: "Relacionamento" },
  { test: (p) => p.startsWith("/content"), title: "Conteudo", section: "Marketing" },
  { test: (p) => p.startsWith("/stores"), title: "Lojas", section: "Administracao" },
  { test: (p) => p.startsWith("/access/roles"), title: "Usuarios e papeis", section: "Administracao" },
  { test: (p) => p.startsWith("/audit/logs"), title: "Auditoria", section: "Administracao" },
  { test: (p) => p.startsWith("/settings"), title: "Configuracoes", section: "Administracao" },
];

export function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const currentStoreId = useCurrentStoreId();
  const [mobileCollapsed, setMobileCollapsed] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [searchDebouncedValue, setSearchDebouncedValue] = useState("");

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

  const globalSearchQuery = useQuery({
    queryKey: ["admin", "global-search", currentStoreId, searchDebouncedValue],
    queryFn: () => fetchGlobalSearch(currentStoreId!, searchDebouncedValue, 6),
    enabled: !!currentStoreId && isSearchOpen && searchDebouncedValue.length >= 2,
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchDebouncedValue(searchValue.trim());
    }, 240);
    return () => window.clearTimeout(timer);
  }, [searchValue]);

  useEffect(() => {
    if (meQuery.isSuccess && authStore.getUser()?.id !== meQuery.data.id) {
      authStore.setUser(meQuery.data);
    }
  }, [meQuery.isSuccess, meQuery.data]);

  useEffect(() => {
    if (!storesQuery.isSuccess) return;
    const stores = storesQuery.data;
    storeStore.validateCurrentStoreId(stores);
    if (!storeStore.getCurrentStoreId() && stores.length > 0) {
      storeStore.setCurrentStoreId(stores[0].store_id);
    }
  }, [storesQuery.isSuccess, storesQuery.data]);

  const onLogout = () => {
    authStore.logout();
    navigate("/login", { replace: true });
  };

  const loading = meQuery.isLoading || storesQuery.isLoading;
  const hasError = meQuery.isError || storesQuery.isError;
  const userEmail = meQuery.data?.email ?? authStore.getUser()?.email;
  const activeRoute = useMemo(
    () => routeMeta.find((meta) => meta.test(location.pathname)) ?? routeMeta[0],
    [location.pathname],
  );
  const can = (permission: string) =>
    hasStorePermission(storesQuery.data, currentStoreId, permission, !!meQuery.data?.is_superuser);

  const filteredMenuItems = useMemo(
    () =>
      menuItems.filter((item) => {
        if (!("key" in item) || !item.key) return true;
        const key = String(item.key);
        if (key === "/") return true;
        if (key === "catalog") return can("catalog.read");
        if (key === "/orders") return can("orders.read");
        if (key === "finance") return can("payments.read");
        if (key === "/customers") return can("customers.read");
        if (key === "/content") return can("content.read");
        if (key === "/settings") return can("settings.read");
        if (key === "/access/roles") return can("members.read");
        if (key === "/audit/logs") return can("audit.read");
        if (key === "/stores") return !!meQuery.data?.is_superuser;
        return true;
      }),
    [can, meQuery.data?.is_superuser],
  );

  useEffect(() => {
    if (isMobile) setMobileCollapsed(true);
  }, [location.pathname, isMobile]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (can("search.read")) setIsSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [can]);

  useEffect(() => {
    if (loading || hasError) return;
    const path = location.pathname;
    if (path === "/") return;
    if (path.startsWith("/catalog") && !can("catalog.read")) navigate("/", { replace: true });
    if (path.startsWith("/orders") && !can("orders.read")) navigate("/", { replace: true });
    if (path.startsWith("/finance") && !can("payments.read")) navigate("/", { replace: true });
    if (path.startsWith("/customers") && !can("customers.read")) navigate("/", { replace: true });
    if (path.startsWith("/content") && !can("content.read")) navigate("/", { replace: true });
    if (path.startsWith("/settings") && !can("settings.read")) navigate("/", { replace: true });
    if (path.startsWith("/access/roles") && !can("members.read")) navigate("/", { replace: true });
    if (path.startsWith("/audit/logs") && !can("audit.read")) navigate("/", { replace: true });
    if (path.startsWith("/stores") && !meQuery.data?.is_superuser) navigate("/", { replace: true });
  }, [location.pathname, loading, hasError, can, navigate, meQuery.data?.is_superuser]);

  return (
    <Layout className="admin-shell">
      <Sider
        width={262}
        className="admin-sider"
        theme="light"
        breakpoint="lg"
        collapsedWidth={0}
        trigger={null}
        collapsible
        collapsed={isMobile ? mobileCollapsed : false}
        onBreakpoint={(broken) => {
          setIsMobile(broken);
          setMobileCollapsed(broken);
        }}
      >
        <div className="brand">
          <Typography.Text className="brand-title">Loja Platform</Typography.Text>
          <Typography.Text className="brand-subtitle">Painel Administrativo</Typography.Text>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[selectedMenuKey(location.pathname)]}
          defaultOpenKeys={["catalog"]}
          items={filteredMenuItems}
          className="admin-menu"
        />
      </Sider>
      <Layout>
        <Header className="admin-header">
          <div className="admin-header-left">
            {isMobile ? (
              <Button
                aria-label="Abrir menu"
                icon={mobileCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                onClick={() => setMobileCollapsed((prev) => !prev)}
              />
            ) : null}
            <StoreSwitcher
              stores={storesQuery.data ?? []}
              currentStoreId={currentStoreId}
              onChange={(id) => storeStore.setCurrentStoreId(id)}
              disabled={loading || hasError}
            />
          </div>
          <div className="admin-header-right">
            <Dropdown
              menu={{
                items: [
                  { key: "dashboard", label: "Dashboard", icon: <HomeOutlined /> },
                  { key: "orders", label: "Novo pedido", icon: <ShoppingCartOutlined /> },
                  { key: "products", label: "Novo produto", icon: <DatabaseOutlined /> },
                  { key: "customers", label: "Clientes", icon: <TeamOutlined /> },
                ],
                onClick: ({ key }) => {
                  if (key === "dashboard") navigate("/");
                  if (key === "orders") navigate("/orders");
                  if (key === "products") navigate("/catalog/products");
                  if (key === "customers") navigate("/customers");
                },
              }}
              trigger={["click"]}
            >
              <Button icon={<ThunderboltOutlined />} aria-label="Acoes rapidas">
                Acoes rapidas
              </Button>
            </Dropdown>
            {can("search.read") ? (
              <Button
                icon={<SearchOutlined />}
                aria-label="Busca global"
                onClick={() => setIsSearchOpen(true)}
              >
                Busca (Ctrl+K)
              </Button>
            ) : null}
            <Tag color="cyan" bordered={false} className="admin-user-chip">
              {userEmail ?? "Usuario"}
            </Tag>
            <Button icon={<LogoutOutlined />} onClick={onLogout}>
              Logout
            </Button>
          </div>
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
              message="Falha ao carregar sessao"
              description="Tente atualizar a pagina."
            />
          ) : (
            <>
              {storesQuery.data && storesQuery.data.length === 0 ? (
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginBottom: 20 }}
                  message="Nenhuma loja associada ao usuario"
                  description="Peca acesso a uma loja para usar o painel."
                />
              ) : null}
              <main className="admin-main">
                <section className="admin-page-head">
                  <div>
                    <Typography.Text className="admin-page-section">{activeRoute.section}</Typography.Text>
                    <Typography.Title level={3} style={{ margin: "4px 0 0" }}>
                      {activeRoute.title}
                    </Typography.Title>
                  </div>
                  <Breadcrumb
                    items={[
                      { title: "Painel" },
                      { title: activeRoute.section },
                      { title: activeRoute.title },
                    ]}
                  />
                </section>
                <Outlet />
              </main>
            </>
          )}
        </Content>
      </Layout>
      <Drawer
        width={700}
        title="Busca global do painel"
        open={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
      >
        <Space direction="vertical" style={{ width: "100%" }} size={14}>
          <Input
            autoFocus
            prefix={<SearchOutlined />}
            placeholder="Buscar pedido, cliente, produto ou SKU"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            aria-label="Buscar pedido, cliente, produto ou SKU"
          />
          {searchDebouncedValue.length < 2 ? (
            <Alert type="info" showIcon message="Digite pelo menos 2 caracteres para iniciar a busca." />
          ) : (
            <ListState
              loading={globalSearchQuery.isLoading}
              isError={globalSearchQuery.isError}
              errorMessage="Falha ao executar busca global"
              isEmpty={
                !globalSearchQuery.isLoading &&
                !globalSearchQuery.isError &&
                (globalSearchQuery.data?.orders.length ?? 0) +
                  (globalSearchQuery.data?.customers.length ?? 0) +
                  (globalSearchQuery.data?.products.length ?? 0) ===
                  0
              }
              emptyDescription="Nenhum resultado para a busca informada"
              onRetry={() => globalSearchQuery.refetch()}
            >
              <section className="global-search-section">
                <Typography.Title level={5}>
                  <FieldTimeOutlined /> Pedidos
                </Typography.Title>
                {(globalSearchQuery.data?.orders ?? []).map((row) => (
                  <button
                    key={`order-${row.id}`}
                    className="global-search-row"
                    onClick={() => {
                      navigate("/orders");
                      setIsSearchOpen(false);
                    }}
                  >
                    <span>Pedido #{row.id}</span>
                    <span>{row.customer_name || "-"}</span>
                    <span>{row.status}</span>
                  </button>
                ))}
              </section>
              <section className="global-search-section">
                <Typography.Title level={5}>
                  <TeamOutlined /> Clientes
                </Typography.Title>
                {(globalSearchQuery.data?.customers ?? []).map((row) => (
                  <button
                    key={`customer-${row.id}`}
                    className="global-search-row"
                    onClick={() => {
                      navigate("/customers");
                      setIsSearchOpen(false);
                    }}
                  >
                    <span>{row.name}</span>
                    <span>{row.email || "-"}</span>
                    <span>{row.total_orders} pedidos</span>
                  </button>
                ))}
              </section>
              <section className="global-search-section">
                <Typography.Title level={5}>
                  <DatabaseOutlined /> Produtos
                </Typography.Title>
                {(globalSearchQuery.data?.products ?? []).map((row) => (
                  <button
                    key={`product-${row.id}`}
                    className="global-search-row"
                    onClick={() => {
                      navigate("/catalog/products");
                      setIsSearchOpen(false);
                    }}
                  >
                    <span>{row.name}</span>
                    <span>{row.sku || "-"}</span>
                    <span>{row.is_active ? "Ativo" : "Inativo"}</span>
                  </button>
                ))}
              </section>
            </ListState>
          )}
        </Space>
      </Drawer>
    </Layout>
  );
}
