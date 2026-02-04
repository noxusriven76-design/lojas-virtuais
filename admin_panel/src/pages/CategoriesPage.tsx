import { Card, Typography } from "antd";
import { storeStore } from "../stores/store.store";

export function CategoriesPage() {
  return (
    <Card title="Categorias" style={{ marginTop: 16 }}>
      <Typography.Paragraph>
        <strong>store_id atual:</strong> {storeStore.getCurrentStoreId() ?? "nenhum"}
      </Typography.Paragraph>
      <Typography.Text type="secondary">Em construção.</Typography.Text>
    </Card>
  );
}

