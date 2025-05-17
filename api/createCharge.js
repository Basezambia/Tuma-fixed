import fetch from 'node-fetch';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const COINBASE_COMMERCE_API_KEY = process.env.COINBASE_COMMERCE_API_KEY;
    if (!COINBASE_COMMERCE_API_KEY) {
      return res.status(500).json({ error: 'Missing Coinbase Commerce API key' });
    }

    const { amount, currency, name, description, metadata } = req.body;
    
    if (!amount || !currency) {
      return res.status(400).json({
        error: 'Missing required fields: amount and currency are required'
      });
    }

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-CC-Api-Key': COINBASE_COMMERCE_API_KEY
      },
      body: JSON.stringify({
        name: name || 'Document Payment',
        description: description || 'Payment for document upload',
        pricing_type: 'fixed_price',
        local_price: { 
          amount: amount.toString(), 
          currency 
        },
        metadata: metadata || {}
      }),
    };

    const response = await fetch('https://api.commerce.coinbase.com/charges', options);
    const data = await response.json();

    if (!response.ok) {
      console.error('Coinbase Commerce API error:', data);
      return res.status(response.status).json({
        error: data.error || data.message || 'Failed to create charge',
        details: data.details
      });
    }

    res.json(data);
  } catch (error) {
    console.error('Charge error:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
}
}
