// API endpoint to get current Arweave token price and calculate storage costs
const axios = require('axios');

// Enable CORS for all routes
const allowCors = fn => async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  return await fn(req, res);
};

// ArDrive-inspired pricing calculation with multiple data points
const getUploadCosts = async (bytes) => {
  try {
    // Get price directly from Arweave network for the exact byte size
    const arweaveResponse = await axios.get(`https://arweave.net/price/${bytes}`, {
      timeout: 10000
    });
    
    const winstonCost = Number(arweaveResponse.data);
    
    if (isNaN(winstonCost) || winstonCost <= 0) {
      throw new Error('Invalid cost data from Arweave network');
    }
    
    return {
      winc: winstonCost.toString(),
      adjustments: {
        networkFactor: 1.0,
        dataItemOverhead: Math.ceil(bytes * 0.001), // Small overhead for data item structure
        bundlingFee: Math.ceil(winstonCost * 0.05) // 5% bundling fee similar to ArDrive
      }
    };
  } catch (error) {
    throw new Error(`Failed to get upload costs: ${error.message}`);
  }
};

const handler = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get pricing for multiple common file sizes (ArDrive approach)
    const commonSizes = [
      1024,           // 1KB
      1024 * 1024,    // 1MB
      5 * 1024 * 1024, // 5MB
      10 * 1024 * 1024 // 10MB
    ];
    
    const uploadCosts = await Promise.all(
      commonSizes.map(size => getUploadCosts(size))
    );
    
    // Get AR to USD rate from multiple sources for reliability
    let arToUsdRate;
    try {
      const coinGeckoResponse = await axios.get(
        'https://api.coingecko.com/api/v3/simple/price?ids=arweave&vs_currencies=usd',
        { timeout: 8000 }
      );
      arToUsdRate = coinGeckoResponse.data?.arweave?.usd;
    } catch (error) {
      // Fallback to CoinMarketCap if CoinGecko fails
      try {
        const cmcResponse = await axios.get(
          'https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=AR',
          { 
            timeout: 8000,
            headers: {
              'X-CMC_PRO_API_KEY': process.env.CMC_API_KEY || 'demo'
            }
          }
        );
        arToUsdRate = cmcResponse.data?.data?.AR?.quote?.USD?.price;
      } catch (fallbackError) {
        // Use a reasonable fallback rate if both APIs fail
        arToUsdRate = 25; // Approximate AR price as fallback
      }
    }
    
    if (!arToUsdRate || isNaN(arToUsdRate) || arToUsdRate <= 0) {
      throw new Error('Unable to fetch valid AR to USD rate');
    }
    
    // Calculate pricing metrics similar to ArDrive
    const oneMBCost = uploadCosts[1]; // 1MB cost data
    const pricePerMBInWinston = Number(oneMBCost.winc);
    const pricePerMBInAR = pricePerMBInWinston / 1e12;
    const pricePerMBInUSD = pricePerMBInAR * arToUsdRate;
    
    // Enhanced pricing structure following ArDrive patterns
    const pricingData = {
      // Legacy compatibility fields
      pricePerMBInAR,
      pricePerMBInUSD,
      pricePerMBInWinston,
      arToUsdRate,
      timestamp: Date.now(),
      networkFactor: 1.0,
      
      // Enhanced ArDrive-style pricing data
      uploadCosts: {
        '1KB': {
          winston: uploadCosts[0].winc,
          ar: Number(uploadCosts[0].winc) / 1e12,
          usd: (Number(uploadCosts[0].winc) / 1e12) * arToUsdRate,
          adjustments: uploadCosts[0].adjustments
        },
        '1MB': {
          winston: uploadCosts[1].winc,
          ar: Number(uploadCosts[1].winc) / 1e12,
          usd: (Number(uploadCosts[1].winc) / 1e12) * arToUsdRate,
          adjustments: uploadCosts[1].adjustments
        },
        '5MB': {
          winston: uploadCosts[2].winc,
          ar: Number(uploadCosts[2].winc) / 1e12,
          usd: (Number(uploadCosts[2].winc) / 1e12) * arToUsdRate,
          adjustments: uploadCosts[2].adjustments
        },
        '10MB': {
          winston: uploadCosts[3].winc,
          ar: Number(uploadCosts[3].winc) / 1e12,
          usd: (Number(uploadCosts[3].winc) / 1e12) * arToUsdRate,
          adjustments: uploadCosts[3].adjustments
        }
      },
      
      // Pricing calculation function for any size
      calculateCost: (bytes) => {
        const baseCostWinston = (Number(uploadCosts[1].winc) / (1024 * 1024)) * bytes;
        const withOverhead = baseCostWinston + Math.ceil(bytes * 0.001);
        const withBundling = withOverhead + Math.ceil(baseCostWinston * 0.05);
        return {
          winston: Math.ceil(withBundling),
          ar: Math.ceil(withBundling) / 1e12,
          usd: (Math.ceil(withBundling) / 1e12) * arToUsdRate
        };
      }
    };
    
    res.status(200).json(pricingData);
  } catch (error) {
    console.error('Error fetching Arweave storage pricing:', error);
    
    // Return error instead of fallback - let frontend handle the error state
    res.status(500).json({
      error: 'Failed to fetch real-time Arweave pricing',
      message: error.message,
      timestamp: Date.now()
    });
  }
};

// Apply CORS to our handler
module.exports = allowCors(handler);
// For backwards compatibility with ES modules
module.exports.default = allowCors(handler);