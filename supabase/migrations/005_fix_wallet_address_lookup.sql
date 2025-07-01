-- Fix wallet address lookup for storage system
-- Create a function that works with wallet address only

CREATE OR REPLACE FUNCTION get_storage_by_wallet(
  p_wallet_address VARCHAR(255)
)
RETURNS TABLE (
  total_credits_mb BIGINT,
  used_credits_mb BIGINT,
  available_credits_mb BIGINT,
  total_files_uploaded BIGINT,
  total_spent_usd DECIMAL(10,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(usc.total_credits_mb, 0) as total_credits_mb,
    COALESCE(usc.used_credits_mb, 0) as used_credits_mb,
    COALESCE(usc.available_credits_mb, 0) as available_credits_mb,
    COALESCE(COUNT(DISTINCT su.id), 0) as total_files_uploaded,
    COALESCE(SUM(sp.price_paid_usdc), 0) as total_spent_usd
  FROM user_storage_credits usc
  LEFT JOIN storage_usage su ON usc.wallet_address = su.wallet_address
  LEFT JOIN storage_purchases sp ON usc.wallet_address = sp.wallet_address AND sp.status = 'completed'
  WHERE usc.wallet_address = p_wallet_address
  GROUP BY usc.total_credits_mb, usc.used_credits_mb, usc.available_credits_mb;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_storage_by_wallet(VARCHAR) TO authenticated, anon;

-- Create a function to initialize storage credits for a wallet address
CREATE OR REPLACE FUNCTION initialize_wallet_storage(
  p_wallet_address VARCHAR(255)
)
RETURNS UUID AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Try to find existing user_id for this wallet
  SELECT user_id INTO v_user_id
  FROM user_storage_credits
  WHERE wallet_address = p_wallet_address
  LIMIT 1;
  
  -- If no user found, create a placeholder UUID
  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    
    -- Insert initial storage credits record
    INSERT INTO user_storage_credits (user_id, wallet_address, total_credits_mb, used_credits_mb)
    VALUES (v_user_id, p_wallet_address, 0, 0)
    ON CONFLICT (user_id, wallet_address) DO NOTHING;
  END IF;
  
  RETURN v_user_id;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION initialize_wallet_storage(VARCHAR) TO authenticated, anon;