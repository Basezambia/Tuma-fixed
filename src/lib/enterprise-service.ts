// Enterprise Service Layer
import { supabase } from './supabase-auth';
import {
  Organization,
  UserOrganization,
  TeamVault,
  VaultPermission,
  FileUpload,
  UserReferral,
  UserDiscount,
  AnalyticsEvent,
  AuditLog,
  ApiKey,
  DashboardMetrics,
  UserAnalytics,
  OrganizationAnalytics,
  StealthAddress,
  ZKProof,
  ObfuscatedMetadata,
  ApiResponse,
  PaginatedResponse,
} from '../types/enterprise';

class EnterpriseService {
  private static instance: EnterpriseService;

  public static getInstance(): EnterpriseService {
    if (!EnterpriseService.instance) {
      EnterpriseService.instance = new EnterpriseService();
    }
    return EnterpriseService.instance;
  }

  // Organization Management
  async createOrganization(data: Partial<Organization>): Promise<ApiResponse<Organization>> {
    try {
      const { data: org, error } = await supabase
        .from('organizations')
        .insert(data)
        .select()
        .single();

      if (error) throw error;

      // Add creator as admin
      const { data: user } = await supabase.auth.getUser();
      if (user.user) {
        await this.addUserToOrganization(user.user.id, org.id, 'admin');
      }

      await this.logAuditEvent({
        action: 'organization_created',
        resource_type: 'organization',
        resource_id: org.id,
        new_values: org,
      });

      return { success: true, data: org };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async getUserOrganizations(userId: string): Promise<ApiResponse<UserOrganization[]>> {
    try {
      const { data, error } = await supabase
        .from('user_organizations')
        .select(`
          *,
          organization:organizations(*)
        `)
        .eq('user_id', userId)
        .eq('is_active', true);

      if (error) throw error;
      return { success: true, data: data || [] };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async getOrganization(organizationId: string): Promise<ApiResponse<Organization>> {
    try {
      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', organizationId)
        .single();

      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async addUserToOrganization(
    userId: string,
    organizationId: string,
    role: 'admin' | 'manager' | 'member'
  ): Promise<ApiResponse<UserOrganization>> {
    try {
      const { data, error } = await supabase
        .from('user_organizations')
        .insert({
          user_id: userId,
          organization_id: organizationId,
          role,
        })
        .select()
        .single();

      if (error) throw error;

      await this.logAuditEvent({
        action: 'user_added_to_organization',
        resource_type: 'user_organization',
        resource_id: data.id,
        new_values: data,
      });

      return { success: true, data };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  // Team Vault Management
  async createTeamVault(data: Partial<TeamVault>): Promise<ApiResponse<TeamVault>> {
    try {
      const { data: vault, error } = await supabase
        .from('team_vaults')
        .insert(data)
        .select()
        .single();

      if (error) throw error;

      await this.logAuditEvent({
        action: 'vault_created',
        resource_type: 'team_vault',
        resource_id: vault.id,
        new_values: vault,
      });

      return { success: true, data: vault };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async getOrganizationVaults(organizationId: string): Promise<ApiResponse<TeamVault[]>> {
    try {
      const { data, error } = await supabase
        .from('team_vaults')
        .select(`
          *,
          permissions:vault_permissions(*)
        `)
        .eq('organization_id', organizationId)
        .eq('is_active', true);

      if (error) throw error;
      return { success: true, data: data || [] };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async grantVaultAccess(
    vaultId: string,
    userId: string,
    permissionLevel: 'read' | 'write' | 'admin'
  ): Promise<ApiResponse<VaultPermission>> {
    try {
      const { data: currentUser } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('vault_permissions')
        .insert({
          vault_id: vaultId,
          user_id: userId,
          permission_level: permissionLevel,
          granted_by: currentUser.user?.id,
        })
        .select()
        .single();

      if (error) throw error;

      await this.logAuditEvent({
        action: 'vault_access_granted',
        resource_type: 'vault_permission',
        resource_id: data.id,
        new_values: data,
      });

      return { success: true, data };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  // Analytics & Metrics
  async trackEvent(event: Partial<AnalyticsEvent>): Promise<void> {
    try {
      await supabase.from('analytics_events').insert({
        ...event,
        created_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Failed to track event:', error);
    }
  }

  async getDashboardMetrics(organizationId?: string): Promise<ApiResponse<DashboardMetrics>> {
    try {
      const baseQuery = supabase.from('file_uploads').select('*');
      const query = organizationId 
        ? baseQuery.eq('organization_id', organizationId)
        : baseQuery;

      const { data: files, error } = await query;
      if (error) throw error;

      // Calculate metrics
      const totalFiles = files?.length || 0;
      const totalStorage = files?.reduce((sum, file) => sum + file.file_size, 0) || 0;
      const totalRevenue = files?.reduce((sum, file) => sum + file.upload_cost, 0) || 0;
      const averageFileSize = totalFiles > 0 ? totalStorage / totalFiles : 0;

      // Get user counts
      const userQuery = organizationId
        ? supabase.from('user_organizations').select('user_id').eq('organization_id', organizationId)
        : supabase.from('analytics_events').select('user_id').not('user_id', 'is', null);

      const { data: users } = await userQuery;
      const totalUsers = new Set(users?.map(u => u.user_id)).size;

      // File type breakdown
      const fileTypes = files?.reduce((acc, file) => {
        const type = file.file_type || 'unknown';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>) || {};

      const topFileTypes = Object.entries(fileTypes)
        .map(([type, count]) => ({
          type,
          count: count as number,
          percentage: ((count as number) / totalFiles) * 100,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      const metrics: DashboardMetrics = {
        totalUsers,
        activeUsers: totalUsers, // Simplified for now
        newUsers: 0, // Would need time-based calculation
        totalFiles,
        totalStorage,
        totalRevenue,
        averageFileSize,
        topFileTypes,
        userGrowth: [], // Would need historical data
        revenueGrowth: [], // Would need historical data
        storageUsage: [], // Would need historical data
      };

      return { success: true, data: metrics };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async getUserAnalytics(userId: string): Promise<ApiResponse<UserAnalytics>> {
    try {
      const { data: files, error } = await supabase
        .from('file_uploads')
        .select('*')
        .eq('user_id', userId);

      if (error) throw error;

      const { data: referrals } = await supabase
        .from('user_referrals')
        .select('*')
        .eq('referrer_id', userId);

      const { data: discount } = await supabase
        .from('user_discounts')
        .select('*')
        .eq('user_id', userId)
        .single();

      const totalUploads = files?.length || 0;
      const totalStorage = files?.reduce((sum, file) => sum + file.file_size, 0) || 0;
      const totalSpent = files?.reduce((sum, file) => sum + file.upload_cost, 0) || 0;
      const lastActivity = files?.[0]?.created_at || '';

      const analytics: UserAnalytics = {
        userId,
        totalUploads,
        totalStorage,
        totalSpent,
        lastActivity,
        referralStats: {
          totalReferrals: referrals?.length || 0,
          qualifiedReferrals: referrals?.filter(r => r.status === 'qualified').length || 0,
          earnedDiscounts: discount?.total_earned || 0,
        },
        uploadHistory: [], // Would need time-based grouping
      };

      return { success: true, data: analytics };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  // Referral System
  async generateReferralCode(userId: string): Promise<ApiResponse<string>> {
    try {
      const code = `REF_${userId.slice(0, 8)}_${Date.now().toString(36)}`;
      
      const { error } = await supabase
        .from('user_referrals')
        .insert({
          referrer_id: userId,
          referral_code: code,
          status: 'pending',
        });

      if (error) throw error;
      return { success: true, data: code };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async processReferral(referralCode: string, newUserId: string): Promise<ApiResponse<boolean>> {
    try {
      const { data: referral, error } = await supabase
        .from('user_referrals')
        .update({ referred_id: newUserId })
        .eq('referral_code', referralCode)
        .eq('status', 'pending')
        .select()
        .single();

      if (error) throw error;

      await this.trackEvent({
        user_id: newUserId,
        event_type: 'referral_signup',
        event_data: { referral_code: referralCode, referrer_id: referral.referrer_id },
      });

      return { success: true, data: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async qualifyReferral(uploadId: string): Promise<ApiResponse<boolean>> {
    try {
      const { data: upload } = await supabase
        .from('file_uploads')
        .select('*')
        .eq('id', uploadId)
        .single();

      if (!upload || upload.file_size < 100 * 1024 * 1024) { // 100MB threshold
        return { success: false, error: 'Upload does not meet qualification criteria' };
      }

      const { data: referral, error } = await supabase
        .from('user_referrals')
        .update({
          status: 'qualified',
          qualifying_upload_id: uploadId,
          qualified_at: new Date().toISOString(),
        })
        .eq('referred_id', upload.user_id)
        .eq('status', 'pending')
        .select()
        .single();

      if (error) throw error;

      // Update referrer's discount
      await supabase.rpc('update_user_discount', { user_uuid: referral.referrer_id });

      return { success: true, data: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async getUserDiscount(userId: string): Promise<ApiResponse<UserDiscount>> {
    try {
      const { data, error } = await supabase
        .from('user_discounts')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows returned

      const discount = data || {
        id: '',
        user_id: userId,
        discount_rate: 0,
        total_referrals: 0,
        total_earned: 0,
        last_updated: new Date().toISOString(),
      };

      return { success: true, data: discount };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  // Zero-Knowledge Privacy
  async generateStealthAddress(): Promise<ApiResponse<StealthAddress>> {
    try {
      // This is a simplified implementation
      // In production, you'd use proper cryptographic libraries
      const crypto = window.crypto;
      const viewKey = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      const spendKey = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      
      // Generate address from keys (simplified)
      const address = `stealth_${viewKey.slice(0, 16)}`;

      const stealthAddress: StealthAddress = {
        address,
        viewKey,
        spendKey,
        created_at: new Date().toISOString(),
      };

      return { success: true, data: stealthAddress };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async obfuscateMetadata(metadata: any): Promise<ApiResponse<ObfuscatedMetadata>> {
    try {
      const crypto = window.crypto;
      const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      // Simplified obfuscation - in production use proper encryption
      const obfuscated: ObfuscatedMetadata = {
        encryptedSize: btoa(JSON.stringify({ size: metadata.size, nonce })),
        encryptedType: btoa(JSON.stringify({ type: metadata.type, nonce })),
        encryptedTimestamp: btoa(JSON.stringify({ timestamp: Date.now() + Math.random() * 86400000, nonce })),
        nonce,
        commitment: `commit_${nonce.slice(0, 16)}`,
      };

      return { success: true, data: obfuscated };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  // Audit Logging
  async logAuditEvent(event: Partial<AuditLog>): Promise<void> {
    try {
      const { data: user } = await supabase.auth.getUser();
      
      await supabase.from('audit_logs').insert({
        ...event,
        user_id: user.user?.id,
        created_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Failed to log audit event:', error);
    }
  }

  async getAuditLogs(
    organizationId?: string,
    page: number = 1,
    limit: number = 50
  ): Promise<ApiResponse<PaginatedResponse<AuditLog>>> {
    try {
      const offset = (page - 1) * limit;
      
      let query = supabase
        .from('audit_logs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (organizationId) {
        query = query.eq('organization_id', organizationId);
      }

      const { data, error, count } = await query;
      if (error) throw error;

      return {
        success: true,
        data: {
          data: data || [],
          total: count || 0,
          page,
          limit,
          hasMore: (count || 0) > offset + limit,
        },
      };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  // API Key Management
  async createApiKey(data: {
    organizationId: string;
    name: string;
    description?: string;
    permissions: Record<string, boolean>;
    rateLimit?: number;
    expires_at?: string | null;
  }): Promise<ApiResponse<{ key: string; apiKey: ApiKey }>> {
    try {
      const { data: user } = await supabase.auth.getUser();
      const key = `tuma_${data.organizationId.slice(0, 8)}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
      const keyHash = btoa(key); // In production, use proper hashing

      const { data: apiKey, error } = await supabase
        .from('api_keys')
        .insert({
          organization_id: data.organizationId,
          name: data.name,
          description: data.description,
          key_hash: keyHash,
          permissions: data.permissions,
          rate_limit: data.rateLimit || 1000,
          usage_count: 0,
          created_by: user.user?.id,
          expires_at: data.expires_at,
        })
        .select()
        .single();

      if (error) throw error;

      await this.logAuditEvent({
        action: 'api_key_created',
        resource_type: 'api_key',
        resource_id: apiKey.id,
        new_values: { name: data.name, permissions: data.permissions },
      });

      return { success: true, data: { key, apiKey } };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async getApiKeys(userId: string, organizationId: string): Promise<ApiResponse<ApiKey[]>> {
    try {
      const { data, error } = await supabase
        .from('api_keys')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return { success: true, data: data || [] };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async deleteApiKey(keyId: string): Promise<ApiResponse<void>> {
    try {
      const { error } = await supabase
        .from('api_keys')
        .update({ is_active: false })
        .eq('id', keyId);

      if (error) throw error;

      await this.logAuditEvent({
        action: 'api_key_deleted',
        resource_type: 'api_key',
        resource_id: keyId,
      });

      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async updateApiKeyStatus(keyId: string, isActive: boolean): Promise<ApiResponse<void>> {
    try {
      const { error } = await supabase
        .from('api_keys')
        .update({ is_active: isActive })
        .eq('id', keyId);

      if (error) throw error;

      await this.logAuditEvent({
        action: isActive ? 'api_key_activated' : 'api_key_deactivated',
        resource_type: 'api_key',
        resource_id: keyId,
      });

      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }
}

export const enterpriseService = EnterpriseService.getInstance();
export default enterpriseService;