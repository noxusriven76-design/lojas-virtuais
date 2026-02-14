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
    <Space className="store-switcher" size={10}>
      <Typography.Text type="secondary" className="store-switcher-label">
        Loja
      </Typography.Text>
      <Select
        style={{ minWidth: 280 }}
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
