const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

async function handler(req, res) {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return res.status(200).json({ success: true });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, walletAddress, includeHistory = 'false' } = req.query;

    if (!userId || !walletAddress) {
      return res.status(400).json({ 
        error: 'Missing required parameters: userId and walletAddress' 
      });
    }

    // Initialize wallet storage if needed and get summary
    const { data: storageData, error: storageError } = await supabase
      .rpc('get_storage_by_wallet', {
        p_wallet_address: walletAddress
      });

    if (storageError) {
      console.error('Error fetching storage summary:', storageError);
      return res.status(500).json({ error: 'Failed to fetch storage summary' });
    }

    // Get detailed storage credits info
    const { data: creditsInfo, error: creditsError } = await supabase
      .from('user_storage_credits')
      .select('*')
      .eq('wallet_address', walletAddress)
      .single();

    // If no credits record exists, create a default response
    const credits = creditsInfo || {
      total_credits_mb: 0,
      used_credits_mb: 0,
      available_credits_mb: 0
    };

    // Get recent purchases
    const { data: recentPurchases, error: purchasesError } = await supabase
      .from('storage_purchases')
      .select(`
        id,
        storage_mb,
        price_paid_usdc,
        payment_method,
        status,
        purchased_at,
        expires_at,
        storage_packages(name, description)
      `)
      .eq('wallet_address', walletAddress)
      .order('purchased_at', { ascending: false })
      .limit(10);

    // Get recent usage
    const { data: recentUsage, error: usageError } = await supabase
      .from('storage_usage')
      .select('*')
      .eq('wallet_address', walletAddress)
      .order('upload_timestamp', { ascending: false })
      .limit(20);

    let transactionHistory = null;
    if (includeHistory === 'true') {
      // Get transaction history
      const { data: transactions, error: transactionsError } = await supabase
        .from('storage_credit_transactions')
        .select('*')
        .eq('wallet_address', walletAddress)
        .order('created_at', { ascending: false })
        .limit(50);

      transactionHistory = transactions || [];
    }

    // Calculate usage statistics
    const totalUploads = recentUsage?.length || 0;
    const totalSizeUploaded = recentUsage?.reduce((sum, usage) => sum + parseFloat(usage.file_size_mb), 0) || 0;
    const averageFileSize = totalUploads > 0 ? totalSizeUploaded / totalUploads : 0;
    
    // Calculate usage percentage
    const usagePercentage = credits.total_credits_mb > 0 
      ? (credits.used_credits_mb / credits.total_credits_mb * 100).toFixed(2)
      : 0;

    // Calculate storage value
    const totalSpentUSD = recentPurchases?.reduce((sum, purchase) => {
      return purchase.status === 'completed' ? sum + parseFloat(purchase.price_paid_usdc || 0) : sum;
    }, 0) || 0;

    // Storage efficiency metrics
    const costPerMB = credits.total_credits_mb > 0 ? totalSpentUSD / credits.total_credits_mb : 0;
    const costPerGB = costPerMB * 1024;

    // Predict when storage will run out (if usage continues at current rate)
    let estimatedDaysRemaining = null;
    if (recentUsage && recentUsage.length > 0 && credits.available_credits_mb > 0) {
      // Calculate average daily usage from last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const recentUsageFiltered = recentUsage.filter(usage => 
        new Date(usage.upload_timestamp) > thirtyDaysAgo
      );
      
      if (recentUsageFiltered.length > 0) {
        const totalRecentUsage = recentUsageFiltered.reduce((sum, usage) => 
          sum + parseFloat(usage.file_size_mb), 0
        );
        const daysInPeriod = Math.min(30, 
          (new Date() - new Date(recentUsageFiltered[recentUsageFiltered.length - 1].upload_timestamp)) / (1000 * 60 * 60 * 24)
        );
        const avgDailyUsage = totalRecentUsage / daysInPeriod;
        
        if (avgDailyUsage > 0) {
          estimatedDaysRemaining = Math.floor(credits.available_credits_mb / avgDailyUsage);
        }
      }
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    return res.status(200).json({
      success: true,
      storage_summary: {
        total_credits_mb: credits.total_credits_mb,
        used_credits_mb: credits.used_credits_mb,
        available_credits_mb: credits.available_credits_mb,
        total_credits_gb: (credits.total_credits_mb / 1024).toFixed(2),
        used_credits_gb: (credits.used_credits_mb / 1024).toFixed(2),
        available_credits_gb: (credits.available_credits_mb / 1024).toFixed(2),
        usage_percentage: parseFloat(usagePercentage),
        account_created: credits.created_at,
        last_activity: credits.updated_at
      },
      usage_statistics: {
        total_uploads: totalUploads,
        total_size_uploaded_mb: totalSizeUploaded.toFixed(2),
        total_size_uploaded_gb: (totalSizeUploaded / 1024).toFixed(2),
        average_file_size_mb: averageFileSize.toFixed(2),
        estimated_days_remaining: estimatedDaysRemaining
      },
      financial_summary: {
        total_spent_usd: totalSpentUSD.toFixed(2),
        total_spent_ar: totalSpentAR.toFixed(6),
        cost_per_mb_usd: costPerMB.toFixed(4),
        cost_per_gb_usd: costPerGB.toFixed(2),
        total_purchases: recentPurchases?.length || 0,
        completed_purchases: recentPurchases?.filter(p => p.status === 'completed').length || 0
      },
      recent_purchases: recentPurchases?.map(purchase => ({
        id: purchase.id,
        package_name: purchase.storage_packages?.name || 'Custom Storage',
        storage_mb: purchase.storage_mb,
        storage_gb: (purchase.storage_mb / 1024).toFixed(2),
        price_paid_usdc: purchase.price_paid_usdc,
        payment_method: purchase.payment_method,
        status: purchase.status,
        purchased_at: purchase.purchased_at,
        expires_at: purchase.expires_at
      })) || [],
      recent_usage: recentUsage?.map(usage => ({
        file_id: usage.file_id,
        file_size_mb: parseFloat(usage.file_size_mb).toFixed(2),
        credits_deducted_mb: parseFloat(usage.credits_deducted_mb).toFixed(2),
        upload_timestamp: usage.upload_timestamp,
        arweave_url: `https://arweave.net/${usage.file_id}`
      })) || [],
      transaction_history: transactionHistory,
      recommendations: {
        should_purchase_more: credits.available_credits_mb < 100, // Less than 100MB
        recommended_package: credits.available_credits_mb < 100 ? 'starter' : null,
        usage_trend: estimatedDaysRemaining && estimatedDaysRemaining < 30 ? 'high' : 'normal',
        efficiency_rating: costPerGB < 0.10 ? 'excellent' : costPerGB < 0.25 ? 'good' : 'fair'
      }
    });

  } catch (error) {
    console.error('Get user storage error:', error);
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
}

module.exports = handler;