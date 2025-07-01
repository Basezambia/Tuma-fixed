-- Storage Credits System for TUMA
-- This enables users to pre-purchase storage and use it for uploads

-- Storage packages that can be purchased
CREATE TABLE storage_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  storage_mb BIGINT NOT NULL, -- Storage amount in MB
  price_usdc DECIMAL(10,2) NOT NULL, -- Fixed USDC price
  base_arweave_cost_usdc DECIMAL(10,2) NOT NULL, -- Actual Arweave storage cost in USDC
  profit_margin_percentage DECIMAL(5,2) DEFAULT 20, -- Our profit margin (20% base)
  discount_percentage DECIMAL(5,2) DEFAULT 0, -- Bulk discount (reduces our profit margin)
  final_discount_percentage DECIMAL(5,2) GENERATED ALWAYS AS (LEAST(profit_margin_percentage - 10, discount_percentage)) STORED, -- Max discount is profit margin minus 10%
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- User storage credits balance
CREATE TABLE user_storage_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_address VARCHAR(255) NOT NULL,
  total_credits_mb BIGINT DEFAULT 0, -- Total purchased storage in MB
  used_credits_mb BIGINT DEFAULT 0, -- Used storage in MB
  available_credits_mb BIGINT GENERATED ALWAYS AS (total_credits_mb - used_credits_mb) STORED,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, wallet_address)
);

-- Storage credit purchases history
CREATE TABLE storage_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_address VARCHAR(255) NOT NULL,
  package_id UUID REFERENCES storage_packages(id),
  storage_mb BIGINT NOT NULL,
  price_paid_usdc DECIMAL(10,2) NOT NULL,
  payment_method VARCHAR(50) DEFAULT 'usdc', -- Fixed to 'usdc'
  coinbase_charge_id VARCHAR(255), -- Coinbase Commerce charge ID
  transaction_hash VARCHAR(255), -- Blockchain transaction hash
  arweave_cost_at_purchase DECIMAL(10,2), -- Actual Arweave cost at time of purchase
  status VARCHAR(50) DEFAULT 'pending', -- pending, completed, failed, refunded
  purchased_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP, -- Optional expiration for credits
  metadata JSONB DEFAULT '{}'
);

-- Storage usage tracking for uploads
CREATE TABLE storage_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_address VARCHAR(255) NOT NULL,
  file_id VARCHAR(255) NOT NULL, -- Arweave transaction ID
  file_size_mb DECIMAL(10,6) NOT NULL,
  credits_deducted_mb DECIMAL(10,6) NOT NULL,
  upload_timestamp TIMESTAMP DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);

-- Storage credit transactions (for audit trail)
CREATE TABLE storage_credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_address VARCHAR(255) NOT NULL,
  transaction_type VARCHAR(50) NOT NULL, -- 'purchase', 'usage', 'refund', 'bonus'
  amount_mb DECIMAL(10,6) NOT NULL, -- Positive for credits added, negative for usage
  balance_before_mb BIGINT,
  balance_after_mb BIGINT,
  reference_id UUID, -- Reference to purchase or usage record
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Insert default storage packages with dynamic pricing structure
-- Note: price_usdc and base_arweave_cost_usdc are now calculated dynamically
-- These values serve as templates for package structure only
INSERT INTO storage_packages (name, description, storage_mb, price_usdc, base_arweave_cost_usdc, profit_margin_percentage, discount_percentage) VALUES
('Starter Pack', 'Perfect for personal use - 1GB storage', 1024, 0, 0, 25, 0), -- 1GB, 0% discount, 25% margin
('Pro Pack', 'Great for professionals - 5GB storage', 5120, 0, 0, 25, 20), -- 5GB, 20% discount, 25% margin
('Business Pack', 'Ideal for small teams - 10GB storage', 10240, 0, 0, 25, 30), -- 10GB, 30% discount, 25% margin
('Enterprise Pack', 'For large organizations - 50GB storage', 51200, 0, 0, 25, 40), -- 50GB, 40% discount, 25% margin
('Ultimate Pack', 'Maximum storage - 100GB storage', 102400, 0, 0, 25, 50); -- 100GB, 50% discount, 25% margin

-- Add comment explaining dynamic pricing
COMMENT ON TABLE storage_packages IS 'Storage packages with dynamic pricing. price_usdc and base_arweave_cost_usdc are calculated in real-time based on current Arweave network costs.';
COMMENT ON COLUMN storage_packages.price_usdc IS 'Placeholder for dynamic price calculation - actual prices calculated in real-time';
COMMENT ON COLUMN storage_packages.base_arweave_cost_usdc IS 'Placeholder for dynamic Arweave cost - actual costs calculated in real-time';
COMMENT ON COLUMN storage_packages.profit_margin_percentage IS 'Profit margin applied to base Arweave costs for dynamic pricing';
COMMENT ON COLUMN storage_packages.discount_percentage IS 'Discount percentage applied to final price for package deals';

-- Create indexes for performance
CREATE INDEX idx_user_storage_credits_user_wallet ON user_storage_credits(user_id, wallet_address);
CREATE INDEX idx_storage_purchases_user_status ON storage_purchases(user_id, status);
CREATE INDEX idx_storage_usage_user_timestamp ON storage_usage(user_id, upload_timestamp);
CREATE INDEX idx_storage_credit_transactions_user_type ON storage_credit_transactions(user_id, transaction_type);

-- Create triggers to update storage credits automatically
CREATE OR REPLACE FUNCTION update_storage_credits_on_purchase()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process completed purchases
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    -- Update or insert user storage credits
    INSERT INTO user_storage_credits (user_id, wallet_address, total_credits_mb)
    VALUES (NEW.user_id, NEW.wallet_address, NEW.storage_mb)
    ON CONFLICT (user_id, wallet_address)
    DO UPDATE SET 
      total_credits_mb = user_storage_credits.total_credits_mb + NEW.storage_mb,
      updated_at = NOW();
    
    -- Record the transaction
    INSERT INTO storage_credit_transactions (
      user_id, wallet_address, transaction_type, amount_mb, 
      reference_id, description
    ) VALUES (
      NEW.user_id, NEW.wallet_address, 'purchase', NEW.storage_mb,
      NEW.id, 'Storage credits purchased: ' || NEW.storage_mb || 'MB'
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_storage_credits_on_purchase
  AFTER INSERT OR UPDATE ON storage_purchases
  FOR EACH ROW
  EXECUTE FUNCTION update_storage_credits_on_purchase();

-- Function to deduct storage credits on file upload
CREATE OR REPLACE FUNCTION deduct_storage_credits(
  p_user_id UUID,
  p_wallet_address VARCHAR(255),
  p_file_id VARCHAR(255),
  p_file_size_mb DECIMAL(10,6)
)
RETURNS BOOLEAN AS $$
DECLARE
  v_available_credits BIGINT;
  v_credits_before BIGINT;
BEGIN
  -- Get current available credits
  SELECT available_credits_mb, total_credits_mb - used_credits_mb
  INTO v_available_credits, v_credits_before
  FROM user_storage_credits
  WHERE user_id = p_user_id AND wallet_address = p_wallet_address;
  
  -- Check if user has enough credits
  IF v_available_credits IS NULL OR v_available_credits < p_file_size_mb THEN
    RETURN FALSE;
  END IF;
  
  -- Deduct credits
  UPDATE user_storage_credits
  SET used_credits_mb = used_credits_mb + p_file_size_mb,
      updated_at = NOW()
  WHERE user_id = p_user_id AND wallet_address = p_wallet_address;
  
  -- Record usage
  INSERT INTO storage_usage (
    user_id, wallet_address, file_id, file_size_mb, credits_deducted_mb
  ) VALUES (
    p_user_id, p_wallet_address, p_file_id, p_file_size_mb, p_file_size_mb
  );
  
  -- Record transaction
  INSERT INTO storage_credit_transactions (
    user_id, wallet_address, transaction_type, amount_mb,
    balance_before_mb, balance_after_mb, reference_id, description
  ) VALUES (
    p_user_id, p_wallet_address, 'usage', -p_file_size_mb,
    v_credits_before, v_credits_before - p_file_size_mb::BIGINT,
    (SELECT id FROM storage_usage WHERE file_id = p_file_id LIMIT 1),
    'Storage used for file: ' || p_file_id
  );
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to get user storage summary
CREATE OR REPLACE FUNCTION get_user_storage_summary(
  p_user_id UUID,
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
    COALESCE(COUNT(su.id), 0) as total_files_uploaded,
    COALESCE(SUM(sp.price_paid_usd), 0) as total_spent_usd
  FROM user_storage_credits usc
  LEFT JOIN storage_usage su ON usc.user_id = su.user_id AND usc.wallet_address = su.wallet_address
  LEFT JOIN storage_purchases sp ON usc.user_id = sp.user_id AND usc.wallet_address = sp.wallet_address AND sp.status = 'completed'
  WHERE usc.user_id = p_user_id AND usc.wallet_address = p_wallet_address
  GROUP BY usc.total_credits_mb, usc.used_credits_mb, usc.available_credits_mb;
END;
$$ LANGUAGE plpgsql;

-- Add RLS (Row Level Security) policies
ALTER TABLE storage_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_storage_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage_credit_transactions ENABLE ROW LEVEL SECURITY;

-- Policies for storage_packages (public read)
CREATE POLICY "Storage packages are viewable by everyone" ON storage_packages
  FOR SELECT USING (is_active = true);

-- Policies for user_storage_credits (users can only see their own)
CREATE POLICY "Users can view their own storage credits" ON user_storage_credits
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own storage credits" ON user_storage_credits
  FOR UPDATE USING (auth.uid() = user_id);

-- Policies for storage_purchases (users can only see their own)
CREATE POLICY "Users can view their own purchases" ON storage_purchases
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own purchases" ON storage_purchases
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policies for storage_usage (users can only see their own)
CREATE POLICY "Users can view their own usage" ON storage_usage
  FOR SELECT USING (auth.uid() = user_id);

-- Policies for storage_credit_transactions (users can only see their own)
CREATE POLICY "Users can view their own transactions" ON storage_credit_transactions
  FOR SELECT USING (auth.uid() = user_id);

-- Create a view for easy storage dashboard
CREATE VIEW user_storage_dashboard AS
SELECT 
  usc.user_id,
  usc.wallet_address,
  usc.total_credits_mb,
  usc.used_credits_mb,
  usc.available_credits_mb,
  ROUND((usc.used_credits_mb::DECIMAL / NULLIF(usc.total_credits_mb, 0)) * 100, 2) as usage_percentage,
  COUNT(DISTINCT su.id) as total_uploads,
  COUNT(DISTINCT sp.id) as total_purchases,
  COALESCE(SUM(sp.price_paid_usd), 0) as total_spent_usd,
  usc.created_at as account_created,
  usc.updated_at as last_activity
FROM user_storage_credits usc
LEFT JOIN storage_usage su ON usc.user_id = su.user_id AND usc.wallet_address = su.wallet_address
LEFT JOIN storage_purchases sp ON usc.user_id = sp.user_id AND usc.wallet_address = sp.wallet_address AND sp.status = 'completed'
GROUP BY usc.user_id, usc.wallet_address, usc.total_credits_mb, usc.used_credits_mb, usc.available_credits_mb, usc.created_at, usc.updated_at;

-- Grant access to the view
GRANT SELECT ON user_storage_dashboard TO authenticated;

-- Create policy for the view
CREATE POLICY "Users can view their own dashboard" ON user_storage_dashboard
  FOR SELECT USING (auth.uid() = user_id);

ALTER VIEW user_storage_dashboard ENABLE ROW LEVEL SECURITY;