const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    userId,
    sellerWallet,
    receivingWallet,
    storageAmountGB,
    pricePerGB,
    description,
    totalPrice
  } = req.body;

  // Validation
  if (!userId || !sellerWallet || !receivingWallet || !storageAmountGB || !pricePerGB) {
    return res.status(400).json({ 
      success: false, 
      error: 'Missing required fields' 
    });
  }

  if (storageAmountGB <= 0 || pricePerGB <= 0) {
    return res.status(400).json({ 
      success: false, 
      error: 'Storage amount and price must be positive numbers' 
    });
  }

  // Enforce minimum pricing of 0.5 USDC total
  const calculatedTotalPrice = totalPrice || (storageAmountGB * pricePerGB);
  const MINIMUM_TOTAL_PRICE = 0.5;
  
  if (calculatedTotalPrice < MINIMUM_TOTAL_PRICE) {
    return res.status(400).json({ 
      success: false, 
      error: `Minimum total price is ${MINIMUM_TOTAL_PRICE} USDC. Current total: ${calculatedTotalPrice.toFixed(2)} USDC` 
    });
  }

  try {
    // Start a transaction
    const { data: transaction, error: transactionError } = await supabase.rpc('begin_transaction');
    
    if (transactionError) {
      console.error('Transaction start error:', transactionError);
    }

    // Check user's available storage credits
    const { data: userStorage, error: storageError } = await supabase
      .from('storage_credits')
      .select('available_credits_mb')
      .eq('user_id', userId)
      .eq('wallet_address', sellerWallet)
      .single();

    if (storageError) {
      console.error('Error checking user storage:', storageError);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to verify storage credits' 
      });
    }

    const requiredStorageMB = storageAmountGB * 1024;
    if (!userStorage || userStorage.available_credits_mb < requiredStorageMB) {
      return res.status(400).json({ 
        success: false, 
        error: 'Insufficient storage credits to create this listing' 
      });
    }

    // Create the P2P listing
    const { data: listing, error: listingError } = await supabase
      .from('p2p_storage_listings')
      .insert({
        seller_user_id: userId,
        seller_wallet: sellerWallet,
        receiving_wallet: receivingWallet,
        storage_amount_gb: storageAmountGB,
        price_per_gb: pricePerGB,
        total_price: totalPrice || (storageAmountGB * pricePerGB),
        description: description || `${storageAmountGB}GB storage credits`,
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (listingError) {
      console.error('Error creating listing:', listingError);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to create listing' 
      });
    }

    // Reserve the storage credits (reduce available credits)
    const { error: reserveError } = await supabase
      .from('storage_credits')
      .update({ 
        available_credits_mb: userStorage.available_credits_mb - requiredStorageMB,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('wallet_address', sellerWallet);

    if (reserveError) {
      console.error('Error reserving storage credits:', reserveError);
      // Try to rollback the listing creation
      await supabase
        .from('p2p_storage_listings')
        .delete()
        .eq('id', listing.id);
      
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to reserve storage credits' 
      });
    }

    // Log the transaction
    const { error: logError } = await supabase
      .from('storage_transactions')
      .insert({
        user_id: userId,
        wallet_address: sellerWallet,
        transaction_type: 'p2p_listing_created',
        storage_amount_mb: requiredStorageMB,
        cost_usdc: 0, // No cost for creating listing
        transaction_hash: `p2p_listing_${listing.id}`,
        status: 'completed',
        metadata: {
          listing_id: listing.id,
          storage_amount_gb: storageAmountGB,
          price_per_gb: pricePerGB,
          total_price: totalPrice || (storageAmountGB * pricePerGB)
        },
        created_at: new Date().toISOString()
      });

    if (logError) {
      console.error('Error logging transaction:', logError);
      // Don't fail the request for logging errors
    }

    return res.status(200).json({
      success: true,
      listing: {
        id: listing.id,
        seller_user_id: listing.seller_user_id,
        seller_wallet: listing.seller_wallet,
        receiving_wallet: listing.receiving_wallet,
        storage_amount_gb: listing.storage_amount_gb,
        price_per_gb: listing.price_per_gb,
        total_price: listing.total_price,
        description: listing.description,
        status: listing.status,
        created_at: listing.created_at
      },
      message: 'Storage listing created successfully'
    });

  } catch (error) {
    console.error('Unexpected error in createP2PListing:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
}

module.exports = handler;