// API endpoint to get current Arweave token price and calculate storage costs
import axios from 'axios';

// Vercel serverless function format
export default async function handler(req, res) {
  // Set CORS headers for API route
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle OPTIONS request for CORS preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    // Fetch Arweave token price from CoinGecko API
    const coinGeckoResponse = await axios.get(
      'https://api.coingecko.com/api/v3/simple/price?ids=arweave&vs_currencies=usd'
    );
    
    const arPrice = coinGeckoResponse.data.arweave.usd;
    
    // Fetch current Arweave network info
    const arweaveNetworkResponse = await axios.get(
      'https://arweave.net/price/0'
    );
    
    // Base price per byte in Winston (1 AR = 1e12 Winston)
    const basePricePerByte = Number(arweaveNetworkResponse.data);
    
    // Calculate price per MB in AR
    const pricePerMBInWinston = basePricePerByte * 1024 * 1024;
    const pricePerMBInAR = pricePerMBInWinston / 1e12;
    
    // Calculate price per MB in USD
    const pricePerMBInUSD = pricePerMBInAR * arPrice;
    
    // Return the pricing information
    res.status(200).json({
      arPrice,
      pricePerMBInAR,
      pricePerMBInUSD,
      timestamp: Date.now(),
      // Include network difficulty factor (simplified for this implementation)
      networkFactor: 1.0
    });
  } catch (error) {
    console.error('Error fetching Arweave pricing:', error);
    res.status(500).json({
      error: 'Failed to fetch Arweave pricing information',
      message: error.message || 'Unknown error'
    });
  }
}
