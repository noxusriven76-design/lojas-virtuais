import { Alert, Button, Empty, Skeleton, Space } from "antd";
import type { ReactNode } from "react";

type Props = {
  loading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  isEmpty?: boolean;
  emptyDescription?: string;
  onRetry?: () => void;
  children: ReactNode;
};

export function ListState({
  loading,
  isError,
  errorMessage,
  isEmpty,
  emptyDescription,
  onRetry,
  children,
}: Props) {
  if (loading) {
    return <Skeleton active paragraph={{ rows: 5 }} />;
  }
  if (isError) {
    return (
      <Alert
        type="error"
        showIcon
        message={errorMessage || "Falha ao carregar dados"}
        action={
          onRetry ? (
            <Button type="link" onClick={onRetry} style={{ paddingInline: 0 }}>
              Tentar novamente
            </Button>
          ) : undefined
        }
      />
    );
  }
  if (isEmpty) {
    return (
      <Space direction="vertical" className="admin-list-empty">
        <Empty description={emptyDescription || "Nenhum registro encontrado"} />
      </Space>
    );
  }
  return <>{children}</>;
}
