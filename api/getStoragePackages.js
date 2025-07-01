const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

// Get current AR price for cost calculation (not for user pricing)
async function getArPrice() {
  try {
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=arweave&vs_currencies=usd');
    const data = await response.json();
    if (!data.arweave?.usd) {
      throw new Error('Invalid AR price data received');
    }
    return data.arweave.usd;
  } catch (error) {
    console.error('Error fetching AR price:', error);
    throw error; // No fallback, let it fail properly
  }
}

// Get Arweave storage cost
async function getArweaveStorageCost(storageMB) {
  try {
    const bytes = storageMB * 1048576; // Convert MB to bytes
    const response = await fetch(`https://arweave.net/price/${bytes}`);
    if (!response.ok) {
      throw new Error(`Arweave API returned ${response.status}`);
    }
    const winston = await response.text();
    const ar = parseFloat(winston) / 1000000000000; // Convert Winston to AR
    if (isNaN(ar) || ar <= 0) {
      throw new Error('Invalid storage cost data received');
    }
    return { ar, winston: parseFloat(winston) };
  } catch (error) {
    console.error('Error fetching Arweave storage cost:', error);
    throw error; // No fallback, let it fail properly
  }
}

// Calculate dynamic USDC price based on real-time Arweave costs only
async function calculateDynamicPackagePrice(storageMB, profitMarginPercent = 25, discountPercent = 0) {
  const arweaveCost = await getArweaveStorageCost(storageMB);
  const currentArPrice = await getArPrice();
  const baseUSDCost = arweaveCost.ar * currentArPrice;
  const priceWithMargin = baseUSDCost * (1 + profitMarginPercent / 100);
  const finalPrice = priceWithMargin * (1 - discountPercent / 100);
  
  return {
    baseArweaveCost: baseUSDCost,
    profitMargin: profitMarginPercent,
    discount: discountPercent,
    finalPriceUSDC: finalPrice,
    arAmount: arweaveCost.ar,
    pricePerGB: finalPrice / (storageMB / 1024),
    mbPerUSDC: storageMB / finalPrice,
    directArweaveCostUSD: baseUSDCost,
    ourProfitMargin: ((finalPrice - baseUSDCost) / baseUSDCost * 100).toFixed(2),
    costSavingsVsSpot: finalPrice < baseUSDCost ? ((baseUSDCost - finalPrice) / baseUSDCost * 100).toFixed(2) : 0
  };
}

async function handler(req, res) {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return res.status(200).json({ success: true });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { includeCustomPricing = 'false' } = req.query;
    
    // Get current AR price
    const currentArPrice = await getArPrice();
    
    // Get storage packages from database
    const { data: packages, error: packagesError } = await supabase
      .from('storage_packages')
      .select('*')
      .eq('is_active', true)
      .order('storage_mb', { ascending: true });

    if (packagesError) {
      console.error('Error fetching packages:', packagesError);
      return res.status(500).json({ error: 'Failed to fetch storage packages' });
    }

    // Calculate package details with dynamic USDC pricing
    const packagesWithPricing = await Promise.all(
      packages.map(async (pkg) => {
        // Calculate dynamic pricing based on current Arweave costs
        const dynamicPricing = await calculateDynamicPackagePrice(
          pkg.storage_mb,
          pkg.profit_margin_percentage || 25,
          pkg.discount_percentage || 0
        );
        
        // Calculate original price without discount for comparison
        const originalPricing = await calculateDynamicPackagePrice(
          pkg.storage_mb,
          pkg.profit_margin_percentage || 25,
          0 // No discount
        );
        
        return {
          ...pkg,
          storage_gb: (pkg.storage_mb / 1024).toFixed(2),
          price_usdc: parseFloat(dynamicPricing.finalPriceUSDC.toFixed(2)), // Dynamic price
          price_per_gb_usdc: parseFloat(dynamicPricing.pricePerGB.toFixed(2)),
          efficiency: {
            mbPerUSDC: dynamicPricing.mbPerUSDC,
            directArweaveCostUSD: dynamicPricing.directArweaveCostUSD,
            ourProfitMargin: dynamicPricing.ourProfitMargin,
            costSavingsVsSpot: dynamicPricing.costSavingsVsSpot
          },
          arweave_direct_cost: {
            ar: dynamicPricing.arAmount,
            usd: parseFloat(dynamicPricing.baseArweaveCost.toFixed(2)),
            winston: null // Not needed for display
          },
          discount_amount_usdc: pkg.discount_percentage > 0 ? 
            parseFloat((originalPricing.finalPriceUSDC - dynamicPricing.finalPriceUSDC).toFixed(2)) : 0,
          original_price_usdc: parseFloat(originalPricing.finalPriceUSDC.toFixed(2)),
          current_ar_price: currentArPrice,
          last_updated: new Date().toISOString(),
          payment_method: 'usdc',
          pricing_type: 'dynamic'
        };
      })
    );

    // Custom pricing calculator data with dynamic pricing
    let customPricingData = null;
    if (includeCustomPricing === 'true') {
      // Provide data for custom storage calculations with dynamic pricing
      const sampleSizes = [
        { size_gb: 1, size_mb: 1024 },
        { size_gb: 5, size_mb: 5120 },
        { size_gb: 10, size_mb: 10240 },
        { size_gb: 25, size_mb: 25600 },
        { size_gb: 50, size_mb: 51200 },
        { size_gb: 100, size_mb: 102400 }
      ];
      
      const customPricing = await Promise.all(
        sampleSizes.map(async (sample) => {
          // Calculate dynamic pricing for custom storage amounts
          const dynamicPricing = await calculateDynamicPackagePrice(
            sample.size_mb,
            25, // 25% profit margin for custom storage
            0   // No discount for custom storage
          );
          
          return {
            ...sample,
            price_usdc: parseFloat(dynamicPricing.finalPriceUSDC.toFixed(2)),
            price_per_gb: parseFloat(dynamicPricing.pricePerGB.toFixed(2)),
            arweave_cost: {
              ar: dynamicPricing.arAmount,
              usd: parseFloat(dynamicPricing.baseArweaveCost.toFixed(2))
            },
            efficiency: {
              mbPerUSDC: dynamicPricing.mbPerUSDC,
              directArweaveCostUSD: dynamicPricing.directArweaveCostUSD,
              ourProfitMargin: dynamicPricing.ourProfitMargin,
              costSavingsVsSpot: dynamicPricing.costSavingsVsSpot
            },
            current_ar_price: currentArPrice,
            last_updated: new Date().toISOString(),
            pricing_type: 'dynamic'
          };
        })
      );
      
      customPricingData = {
        current_ar_price: currentArPrice,
        sample_pricing: customPricing,
        calculator_info: {
          formula: 'Storage cost = Arweave network price + service fee (25% margin)',
          note: 'Prices fluctuate with AR token value and network demand',
          update_frequency: 'Real-time',
          profit_margin: '25%'
        }
      };
    }

    // Market comparison data
    const marketComparison = {
      traditional_cloud: {
        aws_s3: { cost_per_gb_usd: '0.023', type: 'Standard storage' },
        google_cloud: { cost_per_gb_usd: '0.020', type: 'Standard storage' },
        azure: { cost_per_gb_usd: '0.018', type: 'Hot storage' }
      },
      decentralized: {
        arweave_direct: { 
          cost_per_gb_usd: ((await getArweaveStorageCost(1024)).ar * currentArPrice).toFixed(3),
          type: 'Permanent storage'
        },
        ipfs_pinata: { cost_per_gb_usd: '0.15', type: 'IPFS pinning' },
        storj: { cost_per_gb_usd: '0.004', type: 'Decentralized storage' }
      }
    };

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    return res.status(200).json({
      success: true,
      packages: packagesWithPricing,
      market_data: {
        current_ar_price_usd: currentArPrice,
        last_updated: new Date().toISOString(),
        price_source: 'CoinGecko API'
      },
      custom_pricing: customPricingData,
      market_comparison: marketComparison,
      metadata: {
        total_packages: packagesWithPricing.length,
        currency: 'USDC',
        pricing_model: 'fixed_usdc_with_profit_margins',
        payment_method: 'usdc_only'
      },
      features: {
        permanent_storage: true,
        decentralized: true,
        no_monthly_fees: true,
        global_cdn: true,
        immutable: true,
        censorship_resistant: true
      },
      usage_info: {
        how_it_works: [
          'Purchase storage credits with USDC',
          'Upload files through TUMA interface',
          'Storage is automatically deducted from your credits',
          'Files are permanently stored on Arweave network',
          'Access your files anytime with transaction ID'
        ],
        benefits: [
          'Pay once, store forever',
          'No recurring subscription fees',
          'Decentralized and censorship-resistant',
          'Global content delivery network',
          'Cryptographically verified integrity'
        ]
      }
    });

  } catch (error) {
    console.error('Get storage packages error:', error);
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
}

module.exports = handler;