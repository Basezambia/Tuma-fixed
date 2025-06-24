-- Enterprise B2B Schema Extensions
-- Organizations table for multi-tenant architecture
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  domain VARCHAR(255) UNIQUE,
  subscription_tier VARCHAR(50) DEFAULT 'basic',
  max_users INTEGER DEFAULT 10,
  max_storage_gb INTEGER DEFAULT 100,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  settings JSONB DEFAULT '{}',
  billing_email VARCHAR(255),
  is_active BOOLEAN DEFAULT true
);

-- Enhanced user profiles with organization roles
CREATE TABLE user_organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  role VARCHAR(50) DEFAULT 'member', -- admin, manager, member
  permissions JSONB DEFAULT '{}',
  joined_at TIMESTAMP DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true,
  UNIQUE(user_id, organization_id)
);

-- Team vaults for shared file access
CREATE TABLE team_vaults (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  access_policy JSONB DEFAULT '{}',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true
);

-- Vault access permissions
CREATE TABLE vault_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_id UUID REFERENCES team_vaults(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  permission_level VARCHAR(50) DEFAULT 'read', -- read, write, admin
  granted_by UUID REFERENCES auth.users(id),
  granted_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(vault_id, user_id)
);

-- File uploads with enhanced metadata
CREATE TABLE file_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  organization_id UUID REFERENCES organizations(id),
  vault_id UUID REFERENCES team_vaults(id),
  arweave_tx_id VARCHAR(255) UNIQUE,
  file_name VARCHAR(255) NOT NULL,
  file_size BIGINT NOT NULL,
  file_type VARCHAR(100),
  encryption_key_hash VARCHAR(255),
  metadata JSONB DEFAULT '{}',
  upload_cost DECIMAL(10,4),
  currency VARCHAR(10) DEFAULT 'USDC',
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,
  is_public BOOLEAN DEFAULT false,
  download_count INTEGER DEFAULT 0
);

-- Referral system
CREATE TABLE user_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID REFERENCES auth.users(id),
  referred_id UUID REFERENCES auth.users(id),
  referral_code VARCHAR(50) UNIQUE NOT NULL,
  status VARCHAR(50) DEFAULT 'pending', -- pending, qualified, rewarded
  qualifying_upload_id UUID REFERENCES file_uploads(id),
  reward_amount DECIMAL(10,4) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  qualified_at TIMESTAMP,
  rewarded_at TIMESTAMP
);

-- User discount tracking
CREATE TABLE user_discounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  discount_rate DECIMAL(5,2) DEFAULT 0, -- Percentage discount
  total_referrals INTEGER DEFAULT 0,
  total_earned DECIMAL(10,4) DEFAULT 0,
  last_updated TIMESTAMP DEFAULT NOW()
);

-- Analytics events
CREATE TABLE analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  organization_id UUID REFERENCES organizations(id),
  event_type VARCHAR(100) NOT NULL,
  event_data JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Audit trails for compliance
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  organization_id UUID REFERENCES organizations(id),
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(100),
  resource_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- API keys for enterprise integrations
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  key_hash VARCHAR(255) UNIQUE NOT NULL,
  permissions JSONB DEFAULT '{}',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  last_used_at TIMESTAMP,
  expires_at TIMESTAMP,
  is_active BOOLEAN DEFAULT true
);

-- Indexes for performance
CREATE INDEX idx_user_organizations_user_id ON user_organizations(user_id);
CREATE INDEX idx_user_organizations_org_id ON user_organizations(organization_id);
CREATE INDEX idx_file_uploads_user_id ON file_uploads(user_id);
CREATE INDEX idx_file_uploads_org_id ON file_uploads(organization_id);
CREATE INDEX idx_file_uploads_created_at ON file_uploads(created_at);
CREATE INDEX idx_analytics_events_user_id ON analytics_events(user_id);
CREATE INDEX idx_analytics_events_created_at ON analytics_events(created_at);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- Row Level Security (RLS) policies
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_vaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_discounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Organizations: Users can only see organizations they belong to
CREATE POLICY "Users can view their organizations" ON organizations
  FOR SELECT USING (
    id IN (
      SELECT organization_id FROM user_organizations 
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- User organizations: Users can only see their own memberships
CREATE POLICY "Users can view their organization memberships" ON user_organizations
  FOR SELECT USING (user_id = auth.uid());

-- File uploads: Users can see files they uploaded or have vault access to
CREATE POLICY "Users can view accessible files" ON file_uploads
  FOR SELECT USING (
    user_id = auth.uid() OR
    vault_id IN (
      SELECT vault_id FROM vault_permissions 
      WHERE user_id = auth.uid()
    )
  );

-- Functions for common operations
CREATE OR REPLACE FUNCTION get_user_discount_rate(user_uuid UUID)
RETURNS DECIMAL AS $$
DECLARE
  discount_rate DECIMAL := 0;
BEGIN
  SELECT COALESCE(ud.discount_rate, 0) INTO discount_rate
  FROM user_discounts ud
  WHERE ud.user_id = user_uuid;
  
  RETURN discount_rate;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_user_discount(user_uuid UUID)
RETURNS VOID AS $$
DECLARE
  referral_count INTEGER := 0;
  new_discount_rate DECIMAL := 0;
BEGIN
  -- Count qualified referrals
  SELECT COUNT(*) INTO referral_count
  FROM user_referrals
  WHERE referrer_id = user_uuid AND status = 'qualified';
  
  -- Calculate discount rate (1% per referral, max 50%)
  new_discount_rate := LEAST(referral_count * 1.0, 50.0);
  
  -- Update or insert discount record
  INSERT INTO user_discounts (user_id, discount_rate, total_referrals)
  VALUES (user_uuid, new_discount_rate, referral_count)
  ON CONFLICT (user_id) DO UPDATE SET
    discount_rate = new_discount_rate,
    total_referrals = referral_count,
    last_updated = NOW();
END;
$$ LANGUAGE plpgsql;