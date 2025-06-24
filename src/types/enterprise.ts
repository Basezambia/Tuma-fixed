// Enterprise Types and Interfaces

export interface Organization {
  id: string;
  name: string;
  domain?: string;
  subscription_tier: 'basic' | 'professional' | 'enterprise';
  max_users: number;
  max_storage_gb: number;
  created_at: string;
  updated_at: string;
  settings: Record<string, any>;
  billing_email?: string;
  is_active: boolean;
}

export interface UserOrganization {
  id: string;
  user_id: string;
  organization_id: string;
  role: 'admin' | 'manager' | 'member';
  permissions: Record<string, boolean>;
  joined_at: string;
  is_active: boolean;
  organization?: Organization;
}

export interface TeamVault {
  id: string;
  organization_id: string;
  name: string;
  description?: string;
  access_policy: Record<string, any>;
  created_by: string;
  created_at: string;
  is_active: boolean;
  permissions?: VaultPermission[];
}

export interface VaultPermission {
  id: string;
  vault_id: string;
  user_id: string;
  permission_level: 'read' | 'write' | 'admin';
  granted_by: string;
  granted_at: string;
}

export interface FileUpload {
  id: string;
  user_id: string;
  organization_id?: string;
  vault_id?: string;
  arweave_tx_id: string;
  file_name: string;
  file_size: number;
  file_type: string;
  encryption_key_hash: string;
  metadata: Record<string, any>;
  upload_cost: number;
  currency: string;
  created_at: string;
  expires_at?: string;
  is_public: boolean;
  download_count: number;
}

export interface UserReferral {
  id: string;
  referrer_id: string;
  referred_id: string;
  referral_code: string;
  status: 'pending' | 'qualified' | 'rewarded';
  qualifying_upload_id?: string;
  reward_amount: number;
  created_at: string;
  qualified_at?: string;
  rewarded_at?: string;
}

export interface UserDiscount {
  id: string;
  user_id: string;
  discount_rate: number;
  total_referrals: number;
  total_earned: number;
  last_updated: string;
}

export interface AnalyticsEvent {
  id: string;
  user_id?: string;
  organization_id?: string;
  event_type: string;
  event_data: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id?: string;
  organization_id?: string;
  action: string;
  resource_type?: string;
  resource_id?: string;
  old_values?: Record<string, any>;
  new_values?: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}

export interface ApiKey {
  id: string;
  organization_id: string;
  name: string;
  key_hash: string;
  permissions: Record<string, boolean>;
  created_by: string;
  created_at: string;
  last_used_at?: string;
  expires_at?: string;
  is_active: boolean;
  description?: string;
  rate_limit?: number;
  usage_count?: number;
}

export interface ApiKeyWithSecret extends ApiKey {
  key?: string;
}

export interface ApiUsageMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  requestsPerDay: Array<{ date: string; count: number }>;
  topEndpoints: Array<{ endpoint: string; count: number }>;
  errorRates: Array<{ date: string; rate: number }>;
}

// Analytics Dashboard Types
export interface DashboardMetrics {
  totalUsers: number;
  activeUsers: number;
  newUsers: number;
  totalFiles: number;
  totalStorage: number;
  totalRevenue: number;
  averageFileSize: number;
  topFileTypes: Array<{ type: string; count: number; percentage: number }>;
  userGrowth: Array<{ date: string; count: number }>;
  revenueGrowth: Array<{ date: string; amount: number }>;
  storageUsage: Array<{ date: string; size: number }>;
}

export interface UserAnalytics {
  userId: string;
  totalUploads: number;
  totalStorage: number;
  totalSpent: number;
  lastActivity: string;
  referralStats: {
    totalReferrals: number;
    qualifiedReferrals: number;
    earnedDiscounts: number;
  };
  uploadHistory: Array<{
    date: string;
    count: number;
    size: number;
    cost: number;
  }>;
}

export interface OrganizationAnalytics {
  organizationId: string;
  totalMembers: number;
  activeMembers: number;
  totalFiles: number;
  totalStorage: number;
  totalCost: number;
  memberActivity: Array<{
    userId: string;
    userName: string;
    lastActivity: string;
    uploadCount: number;
    storageUsed: number;
  }>;
  departmentUsage: Array<{
    department: string;
    memberCount: number;
    storageUsed: number;
    cost: number;
  }>;
}

// Zero-Knowledge Privacy Types
export interface StealthAddress {
  address: string;
  viewKey: string;
  spendKey: string;
  created_at: string;
}

export interface ZKProof {
  proof: string;
  publicSignals: string[];
  verificationKey: string;
}

export interface ObfuscatedMetadata {
  encryptedSize: string;
  encryptedType: string;
  encryptedTimestamp: string;
  nonce: string;
  commitment: string;
}

export interface ZKKeyPair {
  publicKey: string;
  privateKey: string;
  created_at?: string;
}

export interface PrivacySettings {
  id: string;
  user_id: string;
  stealth_mode_enabled: boolean;
  metadata_obfuscation: boolean;
  zero_knowledge_proofs: boolean;
  anonymous_uploads: boolean;
  privacy_level: 'basic' | 'enhanced' | 'maximum';
  encryption_enabled: boolean;
  encryption_level: 'basic' | 'standard' | 'advanced';
  auto_delete_expired: boolean;
  require_proof_for_access: boolean;
  anonymous_sharing: boolean;
  default_expiration_days: number;
  client_side_encryption: boolean;
  metadata_protection: boolean;
  created_at: string;
  updated_at: string;
}

export interface EncryptedData {
  data: string;
  iv: string;
  salt: string;
  algorithm: string;
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

// Form Types
export interface CreateOrganizationForm {
  name: string;
  domain?: string;
  billing_email: string;
  subscription_tier: 'basic' | 'professional' | 'enterprise';
}

export interface InviteUserForm {
  email: string;
  role: 'admin' | 'manager' | 'member';
  permissions: Record<string, boolean>;
}

export interface CreateVaultForm {
  name: string;
  description?: string;
  access_policy: {
    default_permission: 'read' | 'write';
    require_approval: boolean;
    allowed_file_types: string[];
    max_file_size: number;
  };
}

// Settings Types
export interface OrganizationSettings {
  general: {
    name: string;
    domain?: string;
    logo_url?: string;
    timezone: string;
    language: string;
  };
  security: {
    require_2fa: boolean;
    session_timeout: number;
    allowed_ip_ranges: string[];
    sso_enabled: boolean;
    sso_provider?: string;
  };
  storage: {
    default_retention_days: number;
    auto_delete_expired: boolean;
    encryption_level: 'standard' | 'enhanced';
    backup_enabled: boolean;
  };
  billing: {
    billing_email: string;
    payment_method: string;
    auto_pay: boolean;
    invoice_frequency: 'monthly' | 'quarterly' | 'annually';
  };
  compliance: {
    gdpr_enabled: boolean;
    hipaa_enabled: boolean;
    soc2_enabled: boolean;
    audit_retention_days: number;
  };
}

// Permission Constants
export const PERMISSIONS = {
  ORGANIZATION: {
    VIEW: 'org:view',
    EDIT: 'org:edit',
    DELETE: 'org:delete',
    MANAGE_USERS: 'org:manage_users',
    MANAGE_BILLING: 'org:manage_billing',
    VIEW_ANALYTICS: 'org:view_analytics',
  },
  VAULT: {
    VIEW: 'vault:view',
    CREATE: 'vault:create',
    EDIT: 'vault:edit',
    DELETE: 'vault:delete',
    MANAGE_ACCESS: 'vault:manage_access',
  },
  FILE: {
    VIEW: 'file:view',
    UPLOAD: 'file:upload',
    DOWNLOAD: 'file:download',
    DELETE: 'file:delete',
    SHARE: 'file:share',
  },
  ADMIN: {
    VIEW_AUDIT_LOGS: 'admin:view_audit_logs',
    MANAGE_API_KEYS: 'admin:manage_api_keys',
    SYSTEM_SETTINGS: 'admin:system_settings',
  },
} as const;

// Organization Roles
export const ORGANIZATION_ROLES = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  MEMBER: 'member',
} as const;

// Vault Permissions
export const VAULT_PERMISSIONS = {
  READ: 'read',
  WRITE: 'write',
  ADMIN: 'admin',
} as const;

// Role Definitions
export const ROLE_PERMISSIONS = {
  admin: Object.values(PERMISSIONS).flatMap(p => Object.values(p)),
  manager: [
    ...Object.values(PERMISSIONS.ORGANIZATION).filter(p => p !== PERMISSIONS.ORGANIZATION.DELETE),
    ...Object.values(PERMISSIONS.VAULT),
    ...Object.values(PERMISSIONS.FILE),
  ],
  member: [
    PERMISSIONS.ORGANIZATION.VIEW,
    PERMISSIONS.VAULT.VIEW,
    ...Object.values(PERMISSIONS.FILE),
  ],
} as const;