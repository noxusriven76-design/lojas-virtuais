import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfigProvider } from "antd";
import { RouterProvider } from "react-router-dom";
import { router } from "./router";

const queryClient = new QueryClient();

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider
        theme={{
          token: {
            colorPrimary: "#0ea5a4",
            borderRadius: 12,
            colorBgContainer: "#ffffff",
            colorText: "#0f172a",
            fontFamily: '"Segoe UI Variable", "Aptos", "Trebuchet MS", "Segoe UI", sans-serif',
          },
          components: {
            Card: {
              borderRadiusLG: 16,
            },
            Layout: {
              headerBg: "transparent",
            },
            Menu: {
              itemBorderRadius: 10,
            },
          },
        }}
      >
        <RouterProvider router={router} />
      </ConfigProvider>
    </QueryClientProvider>
  );
}
