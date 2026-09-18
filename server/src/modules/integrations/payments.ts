// Payment integrations: UPI intent (offline-friendly) + Razorpay-ready link.
// Framework-free: returns a normalized instruction the UI/client can act on.

export interface PaymentRequest {
  amount: number;
  currency?: string;
  description?: string;
  upiId?: string;
  razorpay?: { key: string; orderId?: string };
}

export interface PaymentLink {
  method: 'upi' | 'razorpay';
  intent?: string;       // upi:// deep link (works with any UPI app, incl. WhatsApp Pay)
  payload?: any;         // Razorpay checkout payload when method === 'razorpay'
}

export function paymentLink(req: PaymentRequest): PaymentLink {
  const upi = process.env.EPIC_UPI_ID || req.upiId || 'epic@oksbi';
  const currency = req.currency || 'INR';
  const intent = `upi://pay?pa=${encodeURIComponent(upi)}&pn=EpicBOS&am=${req.amount}&cu=${currency}&tn=${encodeURIComponent(req.description || 'Payment')}`;
  const rzKey = req.razorpay?.key || process.env.RAZORPAY_KEY_ID;
  if (rzKey) {
    return {
      method: 'razorpay',
      intent,
      payload: {
        key: rzKey,
        amount: Math.round(req.amount * 100),
        currency,
        order_id: req.razorpay?.orderId,
        description: req.description,
      },
    };
  }
  return { method: 'upi', intent };
}
