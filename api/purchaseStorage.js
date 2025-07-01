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
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

// Get current AR price from CoinGecko
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

// Get real-time Arweave storage cost
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
async function calculateDynamicUSDCPrice(storageMB, profitMarginPercent = 25) {
  const arweaveCost = await getArweaveStorageCost(storageMB);
  const currentArPrice = await getArPrice();
  const baseUSDCost = arweaveCost.ar * currentArPrice;
  const finalPrice = baseUSDCost * (1 + profitMarginPercent / 100);
  
  return {
    baseArweaveCost: baseUSDCost,
    profitMargin: profitMarginPercent,
    finalPriceUSDC: finalPrice,
    arAmount: arweaveCost.ar,
    pricePerGB: finalPrice / (storageMB / 1024)
  };
}

// Calculate storage amount from USDC amount (dynamic pricing)
async function calculateStorageFromUSDC(usdcAmount, profitMarginPercent = 25) {
  // Estimate storage by working backwards from USDC amount
  // This is an approximation since Arweave pricing varies by size
  const currentArPrice = await getArPrice();
  const estimatedArAmount = usdcAmount / (currentArPrice * (1 + profitMarginPercent / 100));
  const estimatedStorageMB = estimatedArAmount * 500; // Rough estimate
  
  // Refine the estimate with actual Arweave pricing
  const actualPricing = await calculateDynamicUSDCPrice(estimatedStorageMB, profitMarginPercent);
  const adjustmentFactor = usdcAmount / actualPricing.finalPriceUSDC;
  
  return Math.floor(estimatedStorageMB * adjustmentFactor);
}

async function handler(req, res) {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return res.status(200).json({ success: true });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { 
      userId, 
      walletAddress, 
      packageId, 
      customStorageMB, 
      arAmount, 
      transactionHash,
      dryRun 
    } = req.body;

    if (!userId || !walletAddress) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: userId, walletAddress'
      });
    }

    // Payment method is fixed to USDC
    const paymentMethod = 'usdc';

    let storageMB, priceUSDC, packageData;
    const currentArPrice = await getArPrice(); // Still needed for cost calculation

    // Handle different purchase types with dynamic pricing
    if (packageId) {
      // Purchasing a predefined package (but with dynamic pricing)
      const { data: packageInfo, error: packageError } = await supabase
        .from('storage_packages')
        .select('*')
        .eq('id', packageId)
        .eq('is_active', true)
        .single();

      if (packageError || !packageInfo) {
        return res.status(404).json({ error: 'Package not found or inactive' });
      }

      packageData = packageInfo;
      storageMB = packageInfo.storage_mb;
      
      // Calculate dynamic price based on current Arweave costs
      const dynamicPricing = await calculateDynamicUSDCPrice(storageMB, packageInfo.profit_margin_percentage || 25);
      priceUSDC = dynamicPricing.finalPriceUSDC;
      
      // Apply package discount if any
      if (packageInfo.discount_percentage > 0) {
        const discountAmount = priceUSDC * (packageInfo.discount_percentage / 100);
        priceUSDC = priceUSDC - discountAmount;
      }
    } else if (customStorageMB) {
      // Custom storage amount with dynamic pricing
      storageMB = customStorageMB;
      const dynamicPricing = await calculateDynamicUSDCPrice(storageMB);
      priceUSDC = dynamicPricing.finalPriceUSDC;
    } else if (usdcAmount) {
      // USDC amount specified - calculate storage dynamically
      storageMB = await calculateStorageFromUSDC(usdcAmount);
      priceUSDC = usdcAmount;
    } else {
      return res.status(400).json({
        success: false,
        error: 'Must specify either packageId, customStorageMB, or usdcAmount'
      });
    }

    // If this is a dry run (price calculation only), return pricing info without creating purchase
    if (dryRun) {
      return res.status(200).json({
        success: true,
        storage_mb: storageMB,
        storage_gb: (storageMB / 1024).toFixed(2),
        price_usdc: priceUSDC,
        payment_method: paymentMethod,
        arweave_cost_at_purchase: currentArPrice,
        package_info: packageData,
        dry_run: true
      });
    }

    // Create purchase record
    const { data: purchase, error: purchaseError } = await supabase
      .from('storage_purchases')
      .insert({
        user_id: userId,
        wallet_address: walletAddress,
        package_id: packageId || null,
        storage_mb: storageMB,
        price_paid_usdc: priceUSDC,
        payment_method: paymentMethod,
        transaction_hash: transactionHash || null,
        arweave_cost_at_purchase: currentArPrice,
        status: transactionHash ? 'completed' : 'pending',
        metadata: {
          package_name: packageData?.name || 'Custom Storage',
          ar_price_at_purchase: currentArPrice,
          storage_calculation: 'usdc_to_storage'
        }
      })
      .select()
      .single();

    if (purchaseError) {
      console.error('Purchase creation error:', purchaseError);
      return res.status(500).json({ error: 'Failed to create purchase record' });
    }

    // If payment is completed, the trigger will automatically update user credits
    let userCredits = null;
    if (purchase.status === 'completed') {
      const { data: credits } = await supabase
        .from('user_storage_credits')
        .select('*')
        .eq('user_id', userId)
        .eq('wallet_address', walletAddress)
        .single();
      
      userCredits = credits;
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    return res.status(200).json({
      success: true,
      purchase_id: purchase.id,
      storage_mb: storageMB,
      storage_gb: (storageMB / 1024).toFixed(2),
      price_usdc: priceUSDC,
      payment_method: paymentMethod,
      arweave_cost_at_purchase: currentArPrice,
      status: purchase.status,
      package_info: packageData,
      userCredits,
      next_steps: {
        message: 'Complete USDC payment to activate storage credits',
        payment_required: !transactionHash,
        payment_method: 'usdc_via_coinbase_commerce'
      }
    });

  } catch (error) {
    console.error('Purchase storage error:', error);
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
}

module.exports = handler;