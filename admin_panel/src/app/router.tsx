import { createBrowserRouter } from "react-router-dom";
import { RequireAuth } from "../auth/RequireAuth";
import { LoginPage } from "../auth/LoginPage";
import { AdminLayout } from "./layout/AdminLayout";
import { DashboardPage } from "../pages/DashboardPage";
import { CategoriesPage } from "../pages/CategoriesPage";
import { ProductsPage } from "../pages/ProductsPage";
import { CustomersPage } from "../pages/CustomersPage";
import { SettingsPage } from "../pages/SettingsPage";

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
      { path: "settings", element: <SettingsPage /> },
    ],
  },
]);

