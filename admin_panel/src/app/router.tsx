import { createBrowserRouter } from "react-router-dom";
import { RequireAuth } from "../auth/RequireAuth";
import { LoginPage } from "../auth/LoginPage";
import { AdminLayout } from "./layout/AdminLayout";
import { DashboardPage } from "../pages/DashboardPage";
import { CategoriesPage } from "../pages/CategoriesPage";
import { ProductsPage } from "../pages/ProductsPage";
import { CustomersPage } from "../pages/CustomersPage";
import { SettingsPage } from "../pages/SettingsPage";
import { StoresPage } from "../pages/StoresPage";
import { OrdersPage } from "../pages/OrdersPage";
import { ContentPage } from "../pages/ContentPage";
import { AccessRolesPage } from "../pages/AccessRolesPage";
import { AuditLogsPage } from "../pages/AuditLogsPage";
import { PaymentsPage } from "../pages/PaymentsPage";
import { PaymentDetailPage } from "../pages/PaymentDetailPage";
import { PaymentsReconciliationPage } from "../pages/PaymentsReconciliationPage";
import { PaymentMethodsPage } from "../pages/PaymentMethodsPage";

export const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "/",
    element: (
      <RequireAuth>
        <AdminLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "catalog/categories", element: <CategoriesPage /> },
      { path: "catalog/products", element: <ProductsPage /> },
      { path: "customers", element: <CustomersPage /> },
      { path: "orders", element: <OrdersPage /> },
      { path: "content", element: <ContentPage /> },
      { path: "stores", element: <StoresPage /> },
      { path: "access/roles", element: <AccessRolesPage /> },
      { path: "audit/logs", element: <AuditLogsPage /> },
      { path: "finance/payments", element: <PaymentsPage /> },
      { path: "finance/payment-methods", element: <PaymentMethodsPage /> },
      { path: "finance/payments/:paymentId", element: <PaymentDetailPage /> },
      { path: "finance/reconciliation", element: <PaymentsReconciliationPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
]);
