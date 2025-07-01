const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Helper function to verify payment status with Coinbase Commerce
const verifyPaymentStatus = async (chargeId) => {
  const apiKey = process.env.COINBASE_COMMERCE_API_KEY;
  if (!apiKey) {
    throw new Error('Payment service not configured');
  }

  const response = await fetch(`https://api.commerce.coinbase.com/charges/${chargeId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-CC-Api-Key': apiKey,
      'X-CC-Version': '2018-03-22'
    }
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Payment verification failed: ${errorData.message || response.statusText}`);
  }

  const data = await response.json();
  return data.data;
};

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    listingId,
    buyerUserId,
    buyerWallet,
    purchaseAmountGB,
    totalPrice,
    platformFee,
    sellerPayment,
    platformChargeId,
    sellerChargeId
  } = req.body;

  // Validation
  if (!listingId || !buyerUserId || !buyerWallet || !purchaseAmountGB || !totalPrice || !platformChargeId || !sellerChargeId) {
    return res.status(400).json({ 
      success: false, 
      error: 'Missing required fields' 
    });
  }

  try {
    // Verify both payments are completed
    const [platformPayment, sellerPaymentStatus] = await Promise.all([
      verifyPaymentStatus(platformChargeId),
      verifyPaymentStatus(sellerChargeId)
    ]);

    // Check if both payments are confirmed
    if (platformPayment.timeline.find(event => event.status === 'CONFIRMED') === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Platform fee payment not confirmed',
        platformPaymentStatus: platformPayment.timeline[platformPayment.timeline.length - 1]?.status
      });
    }

    if (sellerPaymentStatus.timeline.find(event => event.status === 'CONFIRMED') === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Seller payment not confirmed',
        sellerPaymentStatus: sellerPaymentStatus.timeline[sellerPaymentStatus.timeline.length - 1]?.status
      });
    }

    // Get the listing details
    const { data: listing, error: listingError } = await supabase
      .from('p2p_storage_listings')
      .select('*')
      .eq('id', listingId)
      .eq('status', 'active')
      .single();

    if (listingError || !listing) {
      console.error('Error fetching listing:', listingError);
      return res.status(404).json({ 
        success: false, 
        error: 'Listing not found or no longer available' 
      });
    }

    // Check if buyer has existing storage credits record
    let { data: buyerStorage, error: buyerStorageError } = await supabase
      .from('storage_credits')
      .select('*')
      .eq('user_id', buyerUserId)
      .eq('wallet_address', buyerWallet)
      .single();

    if (buyerStorageError && buyerStorageError.code !== 'PGRST116') {
      console.error('Error checking buyer storage:', buyerStorageError);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to verify buyer storage account' 
      });
    }

    // Create buyer storage record if it doesn't exist
    if (!buyerStorage) {
      const { data: newBuyerStorage, error: createError } = await supabase
        .from('storage_credits')
        .insert({
          user_id: buyerUserId,
          wallet_address: buyerWallet,
          total_credits_mb: 0,
          available_credits_mb: 0,
          used_credits_mb: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (createError) {
        console.error('Error creating buyer storage record:', createError);
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to create buyer storage account' 
        });
      }

      buyerStorage = newBuyerStorage;
    }

    const purchaseAmountMB = purchaseAmountGB * 1024;
    const remainingStorageGB = listing.storage_amount_gb - purchaseAmountGB;

    // Start transaction-like operations
    let transactionSuccess = false;

    try {
      // 1. Add storage credits to buyer
      const { error: buyerUpdateError } = await supabase
        .from('storage_credits')
        .update({
          total_credits_mb: buyerStorage.total_credits_mb + purchaseAmountMB,
          available_credits_mb: buyerStorage.available_credits_mb + purchaseAmountMB,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', buyerUserId)
        .eq('wallet_address', buyerWallet);

      if (buyerUpdateError) {
        throw new Error(`Failed to update buyer storage: ${buyerUpdateError.message}`);
      }

      // 2. Update or complete the listing
      if (remainingStorageGB <= 0.001) { // Complete purchase (accounting for floating point precision)
        const { error: listingCompleteError } = await supabase
          .from('p2p_storage_listings')
          .update({
            status: 'completed',
            storage_amount_gb: 0,
            updated_at: new Date().toISOString()
          })
          .eq('id', listingId);

        if (listingCompleteError) {
          throw new Error(`Failed to complete listing: ${listingCompleteError.message}`);
        }
      } else {
        // Partial purchase - update remaining amount
        const { error: listingUpdateError } = await supabase
          .from('p2p_storage_listings')
          .update({
            storage_amount_gb: remainingStorageGB,
            total_price: remainingStorageGB * listing.price_per_gb,
            updated_at: new Date().toISOString()
          })
          .eq('id', listingId);

        if (listingUpdateError) {
          throw new Error(`Failed to update listing: ${listingUpdateError.message}`);
        }
      }

      // 3. Create transaction record for buyer
      const { error: buyerTransactionError } = await supabase
        .from('storage_transactions')
        .insert({
          user_id: buyerUserId,
          wallet_address: buyerWallet,
          transaction_type: 'p2p_purchase',
          storage_amount_mb: purchaseAmountMB,
          cost_usdc: totalPrice,
          transaction_hash: `p2p_purchase_${listingId}_${Date.now()}`,
          status: 'completed',
          metadata: {
            listing_id: listingId,
            seller_wallet: listing.seller_wallet,
            seller_receiving_wallet: listing.receiving_wallet,
            storage_amount_gb: purchaseAmountGB,
            price_per_gb: listing.price_per_gb,
            total_price: totalPrice,
            platform_fee: platformFee,
            seller_payment: sellerPayment,
            platform_charge_id: platformChargeId,
            seller_charge_id: sellerChargeId
          },
          created_at: new Date().toISOString()
        });

      if (buyerTransactionError) {
        throw new Error(`Failed to create buyer transaction: ${buyerTransactionError.message}`);
      }

      // 4. Create transaction record for seller
      const { error: sellerTransactionError } = await supabase
        .from('storage_transactions')
        .insert({
          user_id: listing.seller_user_id,
          wallet_address: listing.seller_wallet,
          transaction_type: 'p2p_sale',
          storage_amount_mb: -purchaseAmountMB, // Negative because they're selling
          cost_usdc: -sellerPayment, // Only seller payment, not total price
          transaction_hash: `p2p_sale_${listingId}_${Date.now()}`,
          status: 'completed',
          metadata: {
            listing_id: listingId,
            buyer_wallet: buyerWallet,
            storage_amount_gb: purchaseAmountGB,
            price_per_gb: listing.price_per_gb,
            total_price: totalPrice,
            platform_fee: platformFee,
            seller_payment: sellerPayment,
            receiving_wallet: listing.receiving_wallet,
            platform_charge_id: platformChargeId,
            seller_charge_id: sellerChargeId
          },
          created_at: new Date().toISOString()
        });

      if (sellerTransactionError) {
        throw new Error(`Failed to create seller transaction: ${sellerTransactionError.message}`);
      }

      // 5. Create P2P transaction record
      const { error: p2pTransactionError } = await supabase
        .from('p2p_transactions')
        .insert({
          listing_id: listingId,
          seller_user_id: listing.seller_user_id,
          seller_wallet: listing.seller_wallet,
          buyer_user_id: buyerUserId,
          buyer_wallet: buyerWallet,
          storage_amount_gb: purchaseAmountGB,
          price_per_gb: listing.price_per_gb,
          total_price: totalPrice,
          platform_fee: platformFee,
          seller_payment: sellerPayment,
          receiving_wallet: listing.receiving_wallet,
          platform_charge_id: platformChargeId,
          seller_charge_id: sellerChargeId,
          status: 'completed',
          created_at: new Date().toISOString()
        });

      if (p2pTransactionError) {
        console.error('Error creating P2P transaction record:', p2pTransactionError);
        // Don't fail the transaction for this, but log it
      }

      transactionSuccess = true;

    } catch (error) {
      console.error('Transaction error:', error);
      
      // Attempt to rollback buyer storage update
      try {
        await supabase
          .from('storage_credits')
          .update({
            total_credits_mb: buyerStorage.total_credits_mb,
            available_credits_mb: buyerStorage.available_credits_mb,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', buyerUserId)
          .eq('wallet_address', buyerWallet);
      } catch (rollbackError) {
        console.error('Rollback error:', rollbackError);
      }

      return res.status(500).json({ 
        success: false, 
        error: error.message || 'Transaction failed' 
      });
    }

    if (transactionSuccess) {
      return res.status(200).json({
        success: true,
        transaction: {
          listing_id: listingId,
          buyer_user_id: buyerUserId,
          buyer_wallet: buyerWallet,
          seller_wallet: listing.seller_wallet,
          receiving_wallet: listing.receiving_wallet,
          storage_amount_gb: purchaseAmountGB,
          price_per_gb: listing.price_per_gb,
          total_price: totalPrice,
          platform_fee: platformFee,
          seller_payment: sellerPayment,
          remaining_storage_gb: remainingStorageGB,
          listing_status: remainingStorageGB <= 0.001 ? 'completed' : 'active'
        },
        message: 'Storage purchased successfully! Payments confirmed and storage credits added.'
      });
    }

  } catch (error) {
    console.error('Unexpected error in confirmP2PPurchase:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
}

module.exports = handler;