import { Select, Space, Typography } from "antd";
import type { MyStore } from "../../stores/stores.api";

type Props = {
  stores: MyStore[];
  currentStoreId: number | null;
  onChange: (id: number) => void;
  disabled?: boolean;
};

export function StoreSwitcher({ stores, currentStoreId, onChange, disabled }: Props) {
  return (
    <Space>
      <Typography.Text type="secondary">Loja</Typography.Text>
      <Select
        style={{ minWidth: 260 }}
        value={currentStoreId ?? undefined}
        placeholder="Selecione uma loja"
        onChange={onChange}
        disabled={disabled || stores.length === 0}
        options={stores.map((s) => ({
          value: s.store_id,
          label: `${s.name} (${s.role})`,
        }))}
      />
    </Space>
  );
}

