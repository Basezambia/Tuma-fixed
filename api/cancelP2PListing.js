import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    listingId,
    userId,
    walletAddress
  } = req.body;

  // Validation
  if (!listingId || !userId || !walletAddress) {
    return res.status(400).json({ 
      success: false, 
      error: 'Missing required fields' 
    });
  }

  try {
    // Get the listing details and verify ownership
    const { data: listing, error: listingError } = await supabase
      .from('p2p_storage_listings')
      .select('*')
      .eq('id', listingId)
      .eq('seller_user_id', userId)
      .eq('seller_wallet', walletAddress)
      .eq('status', 'active')
      .single();

    if (listingError || !listing) {
      console.error('Error fetching listing:', listingError);
      return res.status(404).json({ 
        success: false, 
        error: 'Listing not found or you do not have permission to cancel it' 
      });
    }

    // Get user's current storage credits
    const { data: userStorage, error: storageError } = await supabase
      .from('storage_credits')
      .select('*')
      .eq('user_id', userId)
      .eq('wallet_address', walletAddress)
      .single();

    if (storageError || !userStorage) {
      console.error('Error fetching user storage:', storageError);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to verify storage credits' 
      });
    }

    const storageToReturnMB = listing.storage_amount_gb * 1024;

    // Start transaction-like operations
    let transactionSuccess = false;

    try {
      // 1. Cancel the listing
      const { error: cancelError } = await supabase
        .from('p2p_storage_listings')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString()
        })
        .eq('id', listingId);

      if (cancelError) {
        throw new Error(`Failed to cancel listing: ${cancelError.message}`);
      }

      // 2. Return the reserved storage credits to the user
      const { error: storageUpdateError } = await supabase
        .from('storage_credits')
        .update({
          available_credits_mb: userStorage.available_credits_mb + storageToReturnMB,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .eq('wallet_address', walletAddress);

      if (storageUpdateError) {
        throw new Error(`Failed to return storage credits: ${storageUpdateError.message}`);
      }

      // 3. Log the cancellation transaction
      const { error: transactionError } = await supabase
        .from('storage_transactions')
        .insert({
          user_id: userId,
          wallet_address: walletAddress,
          transaction_type: 'p2p_listing_cancelled',
          storage_amount_mb: storageToReturnMB,
          cost_usdc: 0, // No cost for cancelling
          transaction_hash: `p2p_cancel_${listingId}_${Date.now()}`,
          status: 'completed',
          metadata: {
            listing_id: listingId,
            storage_amount_gb: listing.storage_amount_gb,
            price_per_gb: listing.price_per_gb,
            total_price: listing.total_price,
            reason: 'listing_cancelled_by_seller'
          },
          created_at: new Date().toISOString()
        });

      if (transactionError) {
        console.error('Error logging cancellation transaction:', transactionError);
        // Don't fail the request for logging errors, but log it
      }

      transactionSuccess = true;

    } catch (error) {
      console.error('Transaction error:', error);
      
      // Attempt to rollback the listing status
      try {
        await supabase
          .from('p2p_storage_listings')
          .update({
            status: 'active',
            updated_at: new Date().toISOString()
          })
          .eq('id', listingId);
      } catch (rollbackError) {
        console.error('Rollback error:', rollbackError);
      }

      return res.status(500).json({ 
        success: false, 
        error: error.message || 'Failed to cancel listing' 
      });
    }

    if (transactionSuccess) {
      return res.status(200).json({
        success: true,
        cancelled_listing: {
          id: listing.id,
          storage_amount_gb: listing.storage_amount_gb,
          price_per_gb: listing.price_per_gb,
          total_price: listing.total_price,
          description: listing.description,
          cancelled_at: new Date().toISOString()
        },
        returned_storage_mb: storageToReturnMB,
        message: 'Listing cancelled successfully and storage credits returned'
      });
    }

  } catch (error) {
    console.error('Unexpected error in cancelP2PListing:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
}