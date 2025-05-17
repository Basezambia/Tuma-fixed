// payment-status.ts
// Utility for fetching payment status by chargeId

export type PaymentStatus = 'success' | 'processing' | 'error' | 'pending' | 'confirmed' | 'completed';

export async function fetchPaymentStatus(chargeId: string): Promise<PaymentStatus> {
  try {
    // In production, this will automatically point to /api/chargeStatus
    // In development, it will use the VITE_API_BASE_URL if set, or default to localhost:4000
    const apiBase = import.meta.env.DEV 
      ? (import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000')
      : '';
    const res = await fetch(`${apiBase}/api/chargeStatus?chargeId=${chargeId}`);
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
