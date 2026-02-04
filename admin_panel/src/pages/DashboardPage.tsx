import { Alert, Card, Typography } from "antd";
import { useQuery } from "@tanstack/react-query";
import { fetchMyStores } from "../stores/stores.api";
import { storeStore } from "../stores/store.store";

export function DashboardPage() {
  const { data: stores = [] } = useQuery({
    queryKey: ["admin", "my-stores"],
    queryFn: fetchMyStores,
  });
  const currentStoreId = storeStore.getCurrentStoreId();
  const selectedStore = stores.find((s) => s.store_id === currentStoreId);

  return (
    <Card title="Dashboard" style={{ marginTop: 16 }}>
      {stores.length === 0 ? (
        <Alert
          type="warning"
          showIcon
          message="Nenhuma loja associada ao usuário"
          description="Você não possui lojas para administrar."
        />
      ) : (
        <>
          <Typography.Paragraph>
            <strong>store_id atual:</strong> {currentStoreId ?? "nenhum"}
          </Typography.Paragraph>
          <Typography.Paragraph>
            <strong>Loja selecionada:</strong> {selectedStore?.name ?? "não selecionada"}
          </Typography.Paragraph>
          <Typography.Text type="secondary">Em construção.</Typography.Text>
        </>
      )}
    </Card>
  );
}

