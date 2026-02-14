import { Card, Space } from "antd";
import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
};

export function PageFilterBar({ children }: Props) {
  return (
    <Card size="small" className="admin-filter-card">
      <Space wrap>{children}</Space>
    </Card>
  );
}
