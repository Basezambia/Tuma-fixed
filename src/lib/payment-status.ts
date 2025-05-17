// payment-status.ts
// Utility for fetching payment status by chargeId

export type PaymentStatus = 'success' | 'processing' | 'error' | 'pending' | 'confirmed' | 'completed';

const getApiBaseUrl = () => {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return '';
};

export async function fetchPaymentStatus(chargeId: string): Promise<PaymentStatus> {
  const res = await fetch(`${getApiBaseUrl()}/api/chargeStatus?chargeId=${chargeId}`);
  const data = await res.json();
  if (!data.statusName) return 'pending';
  const status = data.statusName.toLowerCase();
  if ([
    'confirmed', 'completed', 'resolved', 'paid', 'success'
  ].includes(status)) return 'success';
  if (status.includes('error')) return 'error';
  if (status === 'processing') return 'processing';
  return 'pending';
}
