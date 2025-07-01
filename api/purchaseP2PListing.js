const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Platform fee percentage (10%)
const PLATFORM_FEE_PERCENTAGE = 0.10;

// Helper function to create Dynamic payment charge
const createDynamicCharge = async (amount, currency, name, description, metadata = {}) => {
  const apiKey = process.env.COINBASE_COMMERCE_API_KEY;
  if (!apiKey) {
    throw new Error('Payment service not configured');
  }

  const payload = {
    name,
    description,
    pricing_type: 'fixed_price',
    local_price: {
      amount: amount.toString(),
      currency: currency.toUpperCase()
    },
    metadata: {
      ...metadata,
      service: 'tuma-p2p-storage'
    }
  };

  const response = await fetch('https://api.commerce.coinbase.com/charges', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CC-Api-Key': apiKey,
      'X-CC-Version': '2018-03-22'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Payment creation failed: ${errorData.message || response.statusText}`);
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
    totalPrice
  } = req.body;

  // Validation
  if (!listingId || !buyerUserId || !buyerWallet || !purchaseAmountGB || !totalPrice) {
    return res.status(400).json({ 
      success: false, 
      error: 'Missing required fields' 
    });
  }

  if (purchaseAmountGB <= 0 || totalPrice <= 0) {
    return res.status(400).json({ 
      success: false, 
      error: 'Purchase amount and price must be positive numbers' 
    });
  }

  try {
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

    // Validate purchase amount
    if (purchaseAmountGB > listing.storage_amount_gb) {
      return res.status(400).json({ 
        success: false, 
        error: 'Cannot purchase more storage than available in listing' 
      });
    }

    // Validate price calculation
    const expectedPrice = purchaseAmountGB * listing.price_per_gb;
    if (Math.abs(totalPrice - expectedPrice) > 0.01) {
      return res.status(400).json({ 
        success: false, 
        error: 'Price calculation mismatch' 
      });
    }

    // Prevent self-purchase
    if (listing.seller_user_id === buyerUserId || listing.seller_wallet === buyerWallet) {
      return res.status(400).json({ 
        success: false, 
        error: 'Cannot purchase your own listing' 
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

    // Calculate payment split
    const platformFee = totalPrice * PLATFORM_FEE_PERCENTAGE;
    const sellerPayment = totalPrice * (1 - PLATFORM_FEE_PERCENTAGE);

    // Create payment charges
    let platformCharge, sellerCharge;
    
    try {
      // Create platform fee charge (10%)
      platformCharge = await createDynamicCharge(
        platformFee.toFixed(2),
        'USD',
        'Tuma Platform Fee',
        `Platform fee for P2P storage purchase (${purchaseAmountGB}GB)`,
        {
          type: 'platform_fee',
          listing_id: listingId,
          buyer_wallet: buyerWallet,
          seller_wallet: listing.seller_wallet,
          storage_amount_gb: purchaseAmountGB,
          fee_percentage: PLATFORM_FEE_PERCENTAGE * 100
        }
      );

      // Create seller payment charge (90%)
      sellerCharge = await createDynamicCharge(
        sellerPayment.toFixed(2),
        'USD',
        'P2P Storage Payment',
        `Payment to seller for ${purchaseAmountGB}GB storage`,
        {
          type: 'seller_payment',
          listing_id: listingId,
          buyer_wallet: buyerWallet,
          seller_wallet: listing.seller_wallet,
          receiving_wallet: listing.receiving_wallet,
          storage_amount_gb: purchaseAmountGB,
          price_per_gb: listing.price_per_gb
        }
      );

      // Return payment charges for user to complete
      return res.status(200).json({
        success: true,
        requiresPayment: true,
        payments: {
          platformFee: {
            amount: platformFee.toFixed(2),
            charge: platformCharge,
            description: 'Platform fee (10%)'
          },
          sellerPayment: {
            amount: sellerPayment.toFixed(2),
            charge: sellerCharge,
            description: `Payment to seller (90%)`
          }
        },
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
          seller_payment: sellerPayment
        },
        message: 'Please complete both payments to finalize the purchase'
      });

    } catch (paymentError) {
      console.error('Error creating payment charges:', paymentError);
      return res.status(500).json({
        success: false,
        error: 'Failed to create payment charges',
        message: paymentError.message
      });
    }

    // The following code will be moved to a separate endpoint for payment confirmation
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
            total_price: totalPrice
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
          cost_usdc: -totalPrice, // Negative because they're receiving money
          transaction_hash: `p2p_sale_${listingId}_${Date.now()}`,
          status: 'completed',
          metadata: {
            listing_id: listingId,
            buyer_wallet: buyerWallet,
            storage_amount_gb: purchaseAmountGB,
            price_per_gb: listing.price_per_gb,
            total_price: totalPrice,
            receiving_wallet: listing.receiving_wallet
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
          receiving_wallet: listing.receiving_wallet,
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
          remaining_storage_gb: remainingStorageGB,
          listing_status: remainingStorageGB <= 0.001 ? 'completed' : 'active'
        },
        message: 'Storage purchased successfully! Funds will be sent to seller\'s receiving wallet.'
      });
    }

  } catch (error) {
    console.error('Unexpected error in purchaseP2PListing:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
}

module.exports = handler;