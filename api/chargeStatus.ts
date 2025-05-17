import type { VercelRequest, VercelResponse } from '@vercel/node';

const COINBASE_COMMERCE_API_KEY = process.env.COINBASE_COMMERCE_API_KEY!;
const COINBASE_COMMERCE_API_URL = process.env.COINBASE_COMMERCE_API_URL || 'https://api.commerce.coinbase.com/charges';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { chargeId } = req.query;
  if (!chargeId || !COINBASE_COMMERCE_API_KEY) {
    return res.status(400).json({ error: 'Missing chargeId or API key' });
  }

  try {
    const response = await fetch(`${COINBASE_COMMERCE_API_URL}/${chargeId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-CC-Api-Key': COINBASE_COMMERCE_API_KEY,
        'X-CC-Version': '2018-03-22',
      },
    });

    const data = await response.json();
    
    if (!response.ok) {
      return res.status(response.status).json({ error: data.error || data });
    }

    // Extract status from Coinbase response
    const timeline = data.data.timeline || [];
    const latest = timeline.length ? timeline[timeline.length - 1] : {};
    const statusName = data.data.status || latest.status || 'pending';

    return res.status(200).json({ statusName, timeline, data: data.data });
  } catch (error: any) {
    console.error('Charge status error:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch charge status' });
  }
}
