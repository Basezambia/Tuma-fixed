-- P2P Storage Marketplace Migration
-- This migration adds tables and functionality for peer-to-peer storage trading

-- Create P2P Storage Listings table
CREATE TABLE IF NOT EXISTS p2p_storage_listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_user_id UUID NOT NULL,
    seller_wallet TEXT NOT NULL,
    receiving_wallet TEXT NOT NULL, -- Wallet where seller wants to receive payments
    storage_amount_gb DECIMAL(10,3) NOT NULL CHECK (storage_amount_gb > 0),
    price_per_gb DECIMAL(10,4) NOT NULL CHECK (price_per_gb > 0),
    total_price DECIMAL(12,4) NOT NULL CHECK (total_price > 0),
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
    views INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create P2P Transactions table to track all P2P trades
CREATE TABLE IF NOT EXISTS p2p_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL REFERENCES p2p_storage_listings(id),
    seller_user_id UUID NOT NULL,
    seller_wallet TEXT NOT NULL,
    buyer_user_id UUID NOT NULL,
    buyer_wallet TEXT NOT NULL,
    storage_amount_gb DECIMAL(10,3) NOT NULL,
    price_per_gb DECIMAL(10,4) NOT NULL,
    total_price DECIMAL(12,4) NOT NULL,
    receiving_wallet TEXT NOT NULL, -- Where the payment was sent
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed')),
    transaction_hash TEXT, -- For blockchain transaction reference
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_p2p_listings_seller ON p2p_storage_listings(seller_user_id, seller_wallet);
CREATE INDEX IF NOT EXISTS idx_p2p_listings_status ON p2p_storage_listings(status);
CREATE INDEX IF NOT EXISTS idx_p2p_listings_created ON p2p_storage_listings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_p2p_listings_price ON p2p_storage_listings(price_per_gb);
CREATE INDEX IF NOT EXISTS idx_p2p_listings_storage ON p2p_storage_listings(storage_amount_gb);

CREATE INDEX IF NOT EXISTS idx_p2p_transactions_listing ON p2p_transactions(listing_id);
CREATE INDEX IF NOT EXISTS idx_p2p_transactions_seller ON p2p_transactions(seller_user_id, seller_wallet);
CREATE INDEX IF NOT EXISTS idx_p2p_transactions_buyer ON p2p_transactions(buyer_user_id, buyer_wallet);
CREATE INDEX IF NOT EXISTS idx_p2p_transactions_created ON p2p_transactions(created_at DESC);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for p2p_storage_listings
CREATE TRIGGER update_p2p_listings_updated_at 
    BEFORE UPDATE ON p2p_storage_listings 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Add new transaction types to storage_transactions if not already present
DO $$
BEGIN
    -- Check if we need to update the transaction_type constraint
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints 
        WHERE constraint_name LIKE '%storage_transactions_transaction_type%' 
        AND check_clause LIKE '%p2p_listing_created%'
    ) THEN
        -- Drop the existing constraint if it exists
        ALTER TABLE storage_transactions DROP CONSTRAINT IF EXISTS storage_transactions_transaction_type_check;
        
        -- Add the new constraint with P2P transaction types
        ALTER TABLE storage_transactions ADD CONSTRAINT storage_transactions_transaction_type_check 
        CHECK (transaction_type IN (
            'purchase', 
            'upload', 
            'refund', 
            'bonus', 
            'p2p_listing_created',
            'p2p_listing_cancelled', 
            'p2p_purchase', 
            'p2p_sale'
        ));
    END IF;
END
$$;

-- Create view for marketplace statistics
CREATE OR REPLACE VIEW p2p_marketplace_stats AS
SELECT 
    COUNT(*) FILTER (WHERE status = 'active') as active_listings,
    COUNT(*) FILTER (WHERE status = 'completed') as completed_listings,
    COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_listings,
    COALESCE(SUM(storage_amount_gb) FILTER (WHERE status = 'active'), 0) as total_storage_available_gb,
    COALESCE(AVG(price_per_gb) FILTER (WHERE status = 'active'), 0) as average_price_per_gb,
    COALESCE(MIN(price_per_gb) FILTER (WHERE status = 'active'), 0) as min_price_per_gb,
    COALESCE(MAX(price_per_gb) FILTER (WHERE status = 'active'), 0) as max_price_per_gb,
    COUNT(DISTINCT seller_user_id) FILTER (WHERE status = 'active') as active_sellers
FROM p2p_storage_listings;

-- Create view for user P2P activity
CREATE OR REPLACE VIEW user_p2p_activity AS
SELECT 
    u.user_id,
    u.wallet_address,
    -- Selling activity
    COUNT(l.id) FILTER (WHERE l.status = 'active') as active_listings,
    COUNT(l.id) FILTER (WHERE l.status = 'completed') as completed_sales,
    COALESCE(SUM(l.storage_amount_gb) FILTER (WHERE l.status = 'active'), 0) as storage_listed_gb,
    COALESCE(SUM(t.total_price) FILTER (WHERE t.seller_user_id = u.user_id), 0) as total_earned_usdc,
    -- Buying activity
    COUNT(t.id) FILTER (WHERE t.buyer_user_id = u.user_id) as total_purchases,
    COALESCE(SUM(t.storage_amount_gb) FILTER (WHERE t.buyer_user_id = u.user_id), 0) as total_purchased_gb,
    COALESCE(SUM(t.total_price) FILTER (WHERE t.buyer_user_id = u.user_id), 0) as total_spent_usdc
FROM (
    SELECT DISTINCT user_id, wallet_address FROM storage_credits
    UNION
    SELECT DISTINCT seller_user_id as user_id, seller_wallet as wallet_address FROM p2p_storage_listings
    UNION
    SELECT DISTINCT buyer_user_id as user_id, buyer_wallet as wallet_address FROM p2p_transactions
) u
LEFT JOIN p2p_storage_listings l ON u.user_id = l.seller_user_id AND u.wallet_address = l.seller_wallet
LEFT JOIN p2p_transactions t ON (u.user_id = t.seller_user_id AND u.wallet_address = t.seller_wallet) 
                             OR (u.user_id = t.buyer_user_id AND u.wallet_address = t.buyer_wallet)
GROUP BY u.user_id, u.wallet_address;

-- Create function to increment listing views
CREATE OR REPLACE FUNCTION increment_listing_views(listing_uuid UUID)
RETURNS void AS $$
BEGIN
    UPDATE p2p_storage_listings 
    SET views = COALESCE(views, 0) + 1,
        updated_at = NOW()
    WHERE id = listing_uuid AND status = 'active';
END;
$$ LANGUAGE plpgsql;

-- Create function to get marketplace recommendations
CREATE OR REPLACE FUNCTION get_marketplace_recommendations(user_uuid UUID, user_wallet TEXT)
RETURNS TABLE(
    recommendation_type TEXT,
    title TEXT,
    description TEXT,
    action_url TEXT,
    priority INTEGER
) AS $$
DECLARE
    user_storage_gb DECIMAL;
    user_avg_price DECIMAL;
    market_avg_price DECIMAL;
BEGIN
    -- Get user's available storage
    SELECT COALESCE(available_credits_mb / 1024.0, 0) INTO user_storage_gb
    FROM storage_credits 
    WHERE user_id = user_uuid AND wallet_address = user_wallet;
    
    -- Get market average price
    SELECT COALESCE(AVG(price_per_gb), 0) INTO market_avg_price
    FROM p2p_storage_listings 
    WHERE status = 'active';
    
    -- Get user's average listing price
    SELECT COALESCE(AVG(price_per_gb), 0) INTO user_avg_price
    FROM p2p_storage_listings 
    WHERE seller_user_id = user_uuid AND seller_wallet = user_wallet AND status = 'active';
    
    -- Recommendation: Sell excess storage
    IF user_storage_gb > 5 THEN
        RETURN QUERY SELECT 
            'sell_storage'::TEXT,
            'Sell Your Excess Storage'::TEXT,
            format('You have %.1f GB available. Consider listing some for sale.', user_storage_gb)::TEXT,
            '/marketplace?tab=sell'::TEXT,
            1::INTEGER;
    END IF;
    
    -- Recommendation: Adjust pricing
    IF user_avg_price > 0 AND market_avg_price > 0 AND user_avg_price > market_avg_price * 1.2 THEN
        RETURN QUERY SELECT 
            'adjust_pricing'::TEXT,
            'Consider Lowering Your Prices'::TEXT,
            format('Your average price ($%.3f/GB) is above market average ($%.3f/GB).', user_avg_price, market_avg_price)::TEXT,
            '/marketplace?tab=mylistings'::TEXT,
            2::INTEGER;
    END IF;
    
    -- Recommendation: Buy storage at good price
    IF user_storage_gb < 1 AND market_avg_price > 0 THEN
        RETURN QUERY SELECT 
            'buy_storage'::TEXT,
            'Low Storage - Consider P2P Purchase'::TEXT,
            format('Find storage from other users at competitive prices (avg $%.3f/GB).', market_avg_price)::TEXT,
            '/marketplace?tab=buy'::TEXT,
            3::INTEGER;
    END IF;
    
    RETURN;
END;
$$ LANGUAGE plpgsql;

-- Insert some sample data for testing (optional - remove in production)
-- This creates a few sample listings to demonstrate the marketplace
INSERT INTO p2p_storage_listings (
    seller_user_id, 
    seller_wallet, 
    receiving_wallet, 
    storage_amount_gb, 
    price_per_gb, 
    total_price, 
    description, 
    status
) VALUES 
(
    gen_random_uuid(),
    '0x1234567890123456789012345678901234567890',
    '0x1234567890123456789012345678901234567890',
    10.0,
    0.025,
    0.25,
    '10GB Premium Storage - Fast Access',
    'active'
),
(
    gen_random_uuid(),
    '0x2345678901234567890123456789012345678901',
    '0x2345678901234567890123456789012345678901',
    25.5,
    0.020,
    0.51,
    '25.5GB Bulk Storage Deal',
    'active'
),
(
    gen_random_uuid(),
    '0x3456789012345678901234567890123456789012',
    '0x3456789012345678901234567890123456789012',
    5.0,
    0.030,
    0.15,
    '5GB Quick Sale',
    'active'
)
ON CONFLICT DO NOTHING;

-- Grant necessary permissions (adjust based on your RLS policies)
-- These should be configured based on your specific security requirements

-- Enable RLS on new tables
ALTER TABLE p2p_storage_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE p2p_transactions ENABLE ROW LEVEL SECURITY;

-- Create basic RLS policies (customize based on your needs)
CREATE POLICY "Users can view all active listings" ON p2p_storage_listings
    FOR SELECT USING (status = 'active');

CREATE POLICY "Users can manage their own listings" ON p2p_storage_listings
    FOR ALL USING (seller_user_id = auth.uid());

CREATE POLICY "Users can view their own transactions" ON p2p_transactions
    FOR SELECT USING (seller_user_id = auth.uid() OR buyer_user_id = auth.uid());

-- Add comments for documentation
COMMENT ON TABLE p2p_storage_listings IS 'Stores peer-to-peer storage listings where users can sell their storage credits';
COMMENT ON TABLE p2p_transactions IS 'Records all completed P2P storage transactions';
COMMENT ON COLUMN p2p_storage_listings.receiving_wallet IS 'Wallet address where the seller wants to receive payment';
COMMENT ON COLUMN p2p_storage_listings.storage_amount_gb IS 'Amount of storage being sold in GB';
COMMENT ON COLUMN p2p_storage_listings.price_per_gb IS 'Price per GB in USDC';
COMMENT ON COLUMN p2p_storage_listings.total_price IS 'Total price for the entire listing in USDC';

-- Create notification function for new listings (optional)
CREATE OR REPLACE FUNCTION notify_new_listing()
RETURNS TRIGGER AS $$
BEGIN
    -- This could be used to send notifications about new listings
    -- Implementation depends on your notification system
    PERFORM pg_notify('new_p2p_listing', 
        json_build_object(
            'listing_id', NEW.id,
            'storage_amount_gb', NEW.storage_amount_gb,
            'price_per_gb', NEW.price_per_gb,
            'seller_wallet', NEW.seller_wallet
        )::text
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for new listing notifications
CREATE TRIGGER notify_new_listing_trigger
    AFTER INSERT ON p2p_storage_listings
    FOR EACH ROW
    EXECUTE FUNCTION notify_new_listing();

-- Migration completed successfully
SELECT 'P2P Storage Marketplace migration completed successfully' as status;