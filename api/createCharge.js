import fetch from 'node-fetch';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { amount, currency, name, description, metadata } = req.body;
    
    // Validate required fields
    if (!amount || !currency || !name || !description) {
      return res.status(400).json({
        error: 'Missing required fields: amount, currency, name, and description are required'
      });
    }

    // Validate amount is a number
    if (typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive number' });
    }

    // Validate currency is supported
    const supportedCurrencies = ['USD', 'EUR', 'GBP'];
    if (!supportedCurrencies.includes(currency)) {
      return res.status(400).json({ error: 'Unsupported currency' });
    }

    const COINBASE_COMMERCE_API_KEY = process.env.COINBASE_COMMERCE_API_KEY;
    if (!COINBASE_COMMERCE_API_KEY) {
      return res.status(500).json({ error: 'Missing Coinbase Commerce API key' });
    }

    const COINBASE_COMMERCE_API_URL = 'https://api.commerce.coinbase.com/charges';
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
      console.error('Coinbase Commerce API error:', data);
      return res.status(response.status).json({ 
        error: data.error || data.message || 'Failed to create charge',
        details: data.details
      });
    }

    res.status(201).json(data);
  } catch (error) {
    console.error('Charge error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message
    });
  }
}
