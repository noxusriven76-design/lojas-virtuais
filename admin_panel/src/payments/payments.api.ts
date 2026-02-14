import { http } from "../api/http";

export type PaymentTransaction = {
  id: number;
  store_id: number;
  order_id: number;
  provider: string;
  provider_payment_id: string | null;
  status: string;
  amount: number;
  currency: string;
  method: string | null;
  customer_name: string | null;
  customer_email: string | null;
  paid_at: string | null;
  refunded_amount: number;
  raw_payload: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type PaymentTransactionListOut = {
  items: PaymentTransaction[];
  total: number;
  limit: number;
  offset: number;
};

export type PaymentRefund = {
  id: number;
  store_id: number;
  payment_transaction_id: number;
  amount: number;
  status: string;
  provider_refund_id: string | null;
  reason: string;
  created_at: string;
};

export type PaymentRefundListOut = {
  items: PaymentRefund[];
  total: number;
};

export type PaymentWebhookEvent = {
  id: number;
  store_id: number | null;
  provider: string;
  event_id: string;
  event_type: string;
  signature_valid: boolean;
  status: string;
  error_message: string | null;
  processed_at: string | null;
  created_at: string;
};

export type PaymentWebhookEventListOut = {
  items: PaymentWebhookEvent[];
  total: number;
};

export type PaymentReconciliationItem = {
  order_id: number;
  order_status: string;
  order_total: number;
  payment_transaction_id: number | null;
  payment_status: string | null;
  payment_amount: number | null;
  discrepancy_type: string;
  detail: string;
};

export type PaymentReconciliationOut = {
  items: PaymentReconciliationItem[];
  total: number;
  limit: number;
  offset: number;
};

export async function fetchStorePayments(
  storeId: number,
  params: {
    limit: number;
    offset: number;
    status?: string;
    provider?: string;
    method?: string;
    q?: string;
    date_from?: string;
    date_to?: string;
  }
): Promise<PaymentTransactionListOut> {
  const { data } = await http.get<PaymentTransactionListOut>(`/api/v1/admin/stores/${storeId}/payments`, { params });
  return data;
}

export async function fetchStorePaymentById(storeId: number, paymentId: number): Promise<PaymentTransaction> {
  const { data } = await http.get<PaymentTransaction>(`/api/v1/admin/stores/${storeId}/payments/${paymentId}`);
  return data;
}

export async function fetchStorePaymentRefunds(storeId: number, paymentId: number): Promise<PaymentRefundListOut> {
  const { data } = await http.get<PaymentRefundListOut>(`/api/v1/admin/stores/${storeId}/payments/${paymentId}/refunds`);
  return data;
}

export async function fetchStorePaymentWebhookEvents(
  storeId: number,
  paymentId: number,
  limit = 50
): Promise<PaymentWebhookEventListOut> {
  const { data } = await http.get<PaymentWebhookEventListOut>(
    `/api/v1/admin/stores/${storeId}/payments/${paymentId}/webhook-events`,
    { params: { limit } }
  );
  return data;
}

export async function refundStorePayment(
  storeId: number,
  paymentId: number,
  payload: { amount?: number; reason: string }
): Promise<PaymentRefund> {
  const { data } = await http.post<PaymentRefund>(`/api/v1/admin/stores/${storeId}/payments/${paymentId}/refund`, payload);
  return data;
}

export async function fetchStorePaymentsReconciliation(
  storeId: number,
  params: { limit: number; offset: number; date_from?: string; date_to?: string }
): Promise<PaymentReconciliationOut> {
  const { data } = await http.get<PaymentReconciliationOut>(`/api/v1/admin/stores/${storeId}/payments/reconciliation`, {
    params,
  });
  return data;
}
