import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Building2,
  Users,
  Shield,
  Settings,
  Plus,
  UserPlus,
  Crown,
  Key,
  FileText,
  Trash2,
  Edit,
  Mail,
  Calendar,
  Activity,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Copy,
  ExternalLink,
} from 'lucide-react';
import { enterpriseService } from '../lib/enterprise-service';
import {
  Organization,
  UserOrganization,
  TeamVault,
  VaultPermission,
  ORGANIZATION_ROLES,
  VAULT_PERMISSIONS,
} from '../types/enterprise';

interface OrganizationManagementProps {
  userId: string;
  organizationId?: string;
}

interface InviteUserForm {
  email: string;
  role: string;
}

interface CreateVaultForm {
  name: string;
  description: string;
  isPrivate: boolean;
}

export function OrganizationManagement({ userId, organizationId }: OrganizationManagementProps) {
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [members, setMembers] = useState<UserOrganization[]>([]);
  const [vaults, setVaults] = useState<TeamVault[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [showCreateVaultDialog, setShowCreateVaultDialog] = useState(false);
  const [inviteForm, setInviteForm] = useState<InviteUserForm>({ email: '', role: 'member' });
  const [vaultForm, setVaultForm] = useState<CreateVaultForm>({
    name: '',
    description: '',
    isPrivate: false,
  });

  useEffect(() => {
    if (organizationId) {
      loadOrganizationData();
    }
  }, [organizationId, userId]);

  const loadOrganizationData = async () => {
    if (!organizationId) return;
    
    setLoading(true);
    try {
      // Load organization details
      const orgResult = await enterpriseService.getOrganization(organizationId);
      if (orgResult.success) {
        setOrganization(orgResult.data!);
      }

      // Load organization members
      const membersResult = await enterpriseService.getOrganizationMembers(organizationId);
      if (membersResult.success) {
        setMembers(membersResult.data!);
      }

      // Load team vaults
      const vaultsResult = await enterpriseService.getTeamVaults(organizationId);
      if (vaultsResult.success) {
        setVaults(vaultsResult.data!);
      }
    } catch (error) {
      console.error('Failed to load organization data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInviteUser = async () => {
    if (!organizationId || !inviteForm.email.trim()) return;

    try {
      const result = await enterpriseService.inviteUserToOrganization(
        organizationId,
        inviteForm.email.trim(),
        inviteForm.role as any
      );
      
      if (result.success) {
        setShowInviteDialog(false);
        setInviteForm({ email: '', role: 'member' });
        loadOrganizationData(); // Refresh data
      }
    } catch (error) {
      console.error('Failed to invite user:', error);
    }
  };

  const handleCreateVault = async () => {
    if (!organizationId || !vaultForm.name.trim()) return;

    try {
      const result = await enterpriseService.createTeamVault({
        organization_id: organizationId,
        name: vaultForm.name.trim(),
        description: vaultForm.description.trim(),
        is_private: vaultForm.isPrivate,
        created_by: userId,
      });
      
      if (result.success) {
        setShowCreateVaultDialog(false);
        setVaultForm({ name: '', description: '', isPrivate: false });
        loadOrganizationData(); // Refresh data
      }
    } catch (error) {
      console.error('Failed to create vault:', error);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!organizationId) return;
    
    try {
      const result = await enterpriseService.removeUserFromOrganization(organizationId, memberId);
      if (result.success) {
        loadOrganizationData(); // Refresh data
      }
    } catch (error) {
      console.error('Failed to remove member:', error);
    }
  };

  const handleUpdateMemberRole = async (memberId: string, newRole: string) => {
    if (!organizationId) return;
    
    try {
      const result = await enterpriseService.updateUserRole(organizationId, memberId, newRole as any);
      if (result.success) {
        loadOrganizationData(); // Refresh data
      }
    } catch (error) {
      console.error('Failed to update member role:', error);
    }
  };

  const getRoleBadge = (role: string) => {
    const variants = {
      owner: 'bg-purple-100 text-purple-800',
      admin: 'bg-red-100 text-red-800',
      member: 'bg-blue-100 text-blue-800',
      viewer: 'bg-gray-100 text-gray-800',
    };
    
    return (
      <Badge className={variants[role as keyof typeof variants] || 'bg-gray-100 text-gray-800'}>
        {role.charAt(0).toUpperCase() + role.slice(1)}
      </Badge>
    );
  };

  const getPermissionBadge = (permission: string) => {
    const variants = {
      read: 'bg-green-100 text-green-800',
      write: 'bg-blue-100 text-blue-800',
      admin: 'bg-red-100 text-red-800',
    };
    
    return (
      <Badge className={variants[permission as keyof typeof variants] || 'bg-gray-100 text-gray-800'}>
        {permission.charAt(0).toUpperCase() + permission.slice(1)}
      </Badge>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const currentUserMember = members.find(m => m.user_id === userId);
  const canManageMembers = currentUserMember?.role === 'owner' || currentUserMember?.role === 'admin';
  const canCreateVaults = currentUserMember?.role !== 'viewer';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="text-center py-12">
        <Building2 className="h-16 w-16 mx-auto mb-4 text-gray-400" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No Organization Selected</h3>
        <p className="text-gray-500">Please select an organization to manage.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
            <Building2 className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{organization.name}</h1>
            <p className="text-gray-600">{organization.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {getRoleBadge(currentUserMember?.role || 'viewer')}
          <Badge variant="outline">
            {members.length} {members.length === 1 ? 'Member' : 'Members'}
          </Badge>
        </div>
      </div>

      {/* Organization Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Members</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{members.length}</div>
            <p className="text-xs text-muted-foreground">
              {members.filter(m => m.is_active).length} active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Team Vaults</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{vaults.length}</div>
            <p className="text-xs text-muted-foreground">
              {vaults.filter(v => !v.is_private).length} shared
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Files Stored</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground">
              Across all vaults
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Created</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatDate(organization.created_at).split(',')[0]}
            </div>
            <p className="text-xs text-muted-foreground">
              {formatDate(organization.created_at)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="vaults">Team Vaults</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent Activity */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>
                  Latest organization activities
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                      <UserPlus className="h-4 w-4 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">New member joined</p>
                      <p className="text-xs text-gray-500">2 hours ago</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                      <Shield className="h-4 w-4 text-green-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">New vault created</p>
                      <p className="text-xs text-gray-500">1 day ago</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                      <Settings className="h-4 w-4 text-purple-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">Settings updated</p>
                      <p className="text-xs text-gray-500">3 days ago</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
                <CardDescription>
                  Common organization management tasks
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {canManageMembers && (
                  <Button
                    onClick={() => setShowInviteDialog(true)}
                    className="w-full justify-start"
                    variant="outline"
                  >
                    <UserPlus className="h-4 w-4 mr-2" />
                    Invite New Member
                  </Button>
                )}
                {canCreateVaults && (
                  <Button
                    onClick={() => setShowCreateVaultDialog(true)}
                    className="w-full justify-start"
                    variant="outline"
                  >
                    <Shield className="h-4 w-4 mr-2" />
                    Create Team Vault
                  </Button>
                )}
                <Button className="w-full justify-start" variant="outline">
                  <Activity className="h-4 w-4 mr-2" />
                  View Analytics
                </Button>
                <Button className="w-full justify-start" variant="outline">
                  <Key className="h-4 w-4 mr-2" />
                  Manage API Keys
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="members" className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-medium">Organization Members</h3>
              <p className="text-sm text-gray-500">Manage team members and their roles</p>
            </div>
            {canManageMembers && (
              <Button onClick={() => setShowInviteDialog(true)}>
                <UserPlus className="h-4 w-4 mr-2" />
                Invite Member
              </Button>
            )}
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {members.map((member) => (
                  <div key={member.id} className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${member.user_id}`} />
                        <AvatarFallback>
                          {member.user_id.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{member.user_id}</p>
                        <p className="text-sm text-gray-500">
                          Joined {formatDate(member.joined_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {canManageMembers && member.user_id !== userId ? (
                        <Select
                          value={member.role}
                          onValueChange={(value) => handleUpdateMemberRole(member.user_id, value)}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.values(ORGANIZATION_ROLES).map((role) => (
                              <SelectItem key={role} value={role}>
                                {role.charAt(0).toUpperCase() + role.slice(1)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        getRoleBadge(member.role)
                      )}
                      {member.role === 'owner' && (
                        <Crown className="h-4 w-4 text-yellow-500" />
                      )}
                      {canManageMembers && member.user_id !== userId && member.role !== 'owner' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveMember(member.user_id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="vaults" className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-medium">Team Vaults</h3>
              <p className="text-sm text-gray-500">Secure shared storage for your team</p>
            </div>
            {canCreateVaults && (
              <Button onClick={() => setShowCreateVaultDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Vault
              </Button>
            )}
          </div>

          {vaults.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {vaults.map((vault) => (
                <Card key={vault.id} className="hover:shadow-md transition-shadow">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg flex items-center gap-2">
                        {vault.is_private ? (
                          <Lock className="h-4 w-4 text-red-500" />
                        ) : (
                          <Unlock className="h-4 w-4 text-green-500" />
                        )}
                        {vault.name}
                      </CardTitle>
                      <Button variant="ghost" size="sm">
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                    <CardDescription>{vault.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">Files</span>
                        <span className="font-medium">0</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">Size</span>
                        <span className="font-medium">0 MB</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">Created</span>
                        <span className="font-medium">{formatDate(vault.created_at)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={vault.is_private ? 'destructive' : 'default'}>
                          {vault.is_private ? 'Private' : 'Shared'}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="text-center py-12">
                <Shield className="h-16 w-16 mx-auto mb-4 text-gray-400" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Team Vaults</h3>
                <p className="text-gray-500 mb-4">
                  Create your first team vault to start collaborating securely
                </p>
                {canCreateVaults && (
                  <Button onClick={() => setShowCreateVaultDialog(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create First Vault
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="settings" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Organization Settings</CardTitle>
              <CardDescription>
                Manage your organization preferences and configuration
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Alert>
                <Settings className="h-4 w-4" />
                <AlertDescription>
                  Organization settings panel coming soon. You'll be able to configure security policies, integrations, and more.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Invite User Dialog */}
      <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite New Member</DialogTitle>
            <DialogDescription>
              Send an invitation to join {organization.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Email Address</label>
              <Input
                type="email"
                placeholder="user@example.com"
                value={inviteForm.email}
                onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Role</label>
              <Select
                value={inviteForm.role}
                onValueChange={(value) => setInviteForm({ ...inviteForm, role: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(ORGANIZATION_ROLES)
                    .filter(role => role !== 'owner')
                    .map((role) => (
                    <SelectItem key={role} value={role}>
                      {role.charAt(0).toUpperCase() + role.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInviteDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleInviteUser} disabled={!inviteForm.email.trim()}>
              Send Invitation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Vault Dialog */}
      <Dialog open={showCreateVaultDialog} onOpenChange={setShowCreateVaultDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Team Vault</DialogTitle>
            <DialogDescription>
              Create a secure shared storage space for your team
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Vault Name</label>
              <Input
                placeholder="Enter vault name"
                value={vaultForm.name}
                onChange={(e) => setVaultForm({ ...vaultForm, name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Input
                placeholder="Enter vault description (optional)"
                value={vaultForm.description}
                onChange={(e) => setVaultForm({ ...vaultForm, description: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isPrivate"
                checked={vaultForm.isPrivate}
                onChange={(e) => setVaultForm({ ...vaultForm, isPrivate: e.target.checked })}
              />
              <label htmlFor="isPrivate" className="text-sm font-medium">
                Private vault (only accessible by invited members)
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateVaultDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateVault} disabled={!vaultForm.name.trim()}>
              Create Vault
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default OrganizationManagement;