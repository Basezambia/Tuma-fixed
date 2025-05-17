// payment-status.ts
// Utility for fetching payment status by chargeId

export type PaymentStatus = 'success' | 'processing' | 'error' | 'pending' | 'confirmed' | 'completed';

export async function fetchPaymentStatus(chargeId: string): Promise<PaymentStatus> {
  try {
    const res = await fetch(`/api/chargeStatus?chargeId=${chargeId}`);
    const data = await res.json();
    if (!data.statusName) return 'pending';
    const status = data.statusName.toLowerCase();
    if ([
      'confirmed', 'completed', 'resolved', 'paid', 'success'
    ].includes(status)) return 'success';
    if (status.includes('error')) return 'error';
    if (status === 'processing') return 'processing';
    return 'pending';
  } catch {
    return 'pending';
  }
}
