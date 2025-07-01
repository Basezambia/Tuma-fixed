const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get all active P2P storage listings
    const { data: listings, error } = await supabase
      .from('p2p_storage_listings')
      .select(`
        *,
        seller:profiles!p2p_storage_listings_seller_user_id_fkey(
          id,
          wallet_address,
          username
        )
      `)
      .eq('status', 'active')
      .gt('storage_amount_gb', 0)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching P2P listings:', error);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch marketplace listings' 
      });
    }

    // Format the listings for frontend consumption
    const formattedListings = listings.map(listing => ({
      id: listing.id,
      seller_user_id: listing.seller_user_id,
      seller_wallet: listing.seller_wallet,
      receiving_wallet: listing.receiving_wallet,
      storage_amount_gb: listing.storage_amount_gb,
      price_per_gb: listing.price_per_gb,
      total_price: listing.total_price,
      description: listing.description,
      status: listing.status,
      created_at: listing.created_at,
      updated_at: listing.updated_at,
      views: listing.views || 0,
      seller_info: listing.seller ? {
        username: listing.seller.username,
        wallet_address: listing.seller.wallet_address
      } : null
    }));

    return res.status(200).json({
      success: true,
      listings: formattedListings,
      total_count: formattedListings.length
    });

  } catch (error) {
    console.error('Unexpected error in getP2PListings:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
}

module.exports = handler;