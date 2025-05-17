import fetch from 'node-fetch';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const COINBASE_COMMERCE_API_KEY = process.env.COINBASE_COMMERCE_API_KEY;
    if (!COINBASE_COMMERCE_API_KEY) {
      return res.status(500).json({ 
        error: 'Missing Coinbase Commerce API key',
        details: 'Please set COINBASE_COMMERCE_API_KEY in environment variables'
      });
    }

    const { amount, currency, name, description, metadata } = req.body;
    
    if (!amount || !currency) {
      return res.status(400).json({
        error: 'Missing required fields',
        details: 'amount and currency are required'
      });
    }

    if (typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({
        error: 'Invalid amount',
        details: 'Amount must be a positive number'
      });
    }

    const supportedCurrencies = ['USD', 'EUR', 'GBP'];
    if (!supportedCurrencies.includes(currency)) {
      return res.status(400).json({
        error: 'Unsupported currency',
        details: `Supported currencies: ${supportedCurrencies.join(', ')}`
      });
    }

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-CC-Api-Key': COINBASE_COMMERCE_API_KEY,
        'X-CC-Version': '2018-03-22'
      },
      body: JSON.stringify({
        name: name || 'Document Payment',
        description: description || 'Payment for document upload',
        pricing_type: 'fixed_price',
        local_price: { 
          amount: amount.toString(), 
          currency 
        },
        metadata: metadata || {},
        redirect_url: `${process.env.NEXT_PUBLIC_BASE_URL}/payment/success`,
        cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/payment/cancel`
      }),
    };

    try {
      const response = await fetch('https://api.commerce.coinbase.com/charges', options);
      const data = await response.text();
      
      if (!response.ok) {
        console.error('Coinbase Commerce API response:', data);
        return res.status(response.status).json({
          error: 'Failed to create charge',
          details: data
        });
      }

      // Parse JSON safely
      try {
        const parsedData = JSON.parse(data);
        return res.status(201).json(parsedData);
      } catch (parseError) {
        console.error('Failed to parse Coinbase response:', parseError);
        return res.status(500).json({
          error: 'Invalid response from Coinbase Commerce',
          details: data
        });
      }
    } catch (fetchError) {
      console.error('Fetch error:', fetchError);
      return res.status(500).json({
        error: 'Network error creating charge',
        details: fetchError.message
      });
    }
  } catch (error) {
    console.error('Charge creation error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
}
}
