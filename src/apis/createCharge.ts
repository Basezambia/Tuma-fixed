import type { VercelRequest, VercelResponse } from '@vercel/node';

const COINBASE_COMMERCE_API_KEY = process.env.COINBASE_COMMERCE_API_KEY!;
const COINBASE_COMMERCE_API_URL = 'https://api.commerce.coinbase.com/charges';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { amount, currency = 'USD', name = 'Document Payment', description = 'Payment for document upload', metadata = {} } = req.body;

  if (!amount || !COINBASE_COMMERCE_API_KEY) {
    res.status(400).json({ error: 'Missing parameters or API key' });
    return;
  }

  try {
    const response = await fetch(COINBASE_COMMERCE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CC-Api-Key': COINBASE_COMMERCE_API_KEY,
        'X-CC-Version': '2018-03-22',
      },
      body: JSON.stringify({
        name,
        description,
        pricing_type: 'fixed_price',
        local_price: { amount: amount.toString(), currency },
        metadata,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      res.status(response.status).json({ error: data.error || data });
      return;
    }
    res.status(200).json({ id: data.data.id });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to create charge' });
  }
}
