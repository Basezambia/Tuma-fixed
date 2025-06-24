import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Key,
  Plus,
  Copy,
  Check,
  Eye,
  EyeOff,
  Trash2,
  Edit,
  Activity,
  BarChart3,
  Clock,
  Shield,
  AlertTriangle,
  Info,
  Settings,
  Zap,
  Globe,
  Lock,
  Unlock,
  RefreshCw,
  Download,
} from 'lucide-react';
import { enterpriseService } from '../lib/enterprise-service';
import { analyticsService } from '../lib/analytics-service';
import { ApiKey, ApiUsageMetrics } from '../types/enterprise';

interface ApiManagementProps {
  userId: string;
  organizationId?: string;
}

interface CreateApiKeyForm {
  name: string;
  description: string;
  permissions: string[];
  rateLimit: number;
  expiresAt?: string;
}

interface ApiKeyWithSecret extends ApiKey {
  secret?: string;
}

export function ApiManagement({ userId, organizationId }: ApiManagementProps) {
  const [apiKeys, setApiKeys] = useState<ApiKeyWithSecret[]>([]);
  const [usageMetrics, setUsageMetrics] = useState<ApiUsageMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('keys');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedKey, setSelectedKey] = useState<ApiKey | null>(null);
  const [createForm, setCreateForm] = useState<CreateApiKeyForm>({
    name: '',
    description: '',
    permissions: ['read'],
    rateLimit: 1000,
    expiresAt: '',
  });
  const [copySuccess, setCopySuccess] = useState<string>('');
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadApiData();
  }, [userId, organizationId]);

  const loadApiData = async () => {
    setLoading(true);
    try {
      // Load API keys
      const keysResult = await enterpriseService.getApiKeys(userId, organizationId);
      if (keysResult.success) {
        setApiKeys(keysResult.data!);
      }

      // Load usage metrics
      const metricsResult = await analyticsService.getApiUsageMetrics(userId, organizationId);
      if (metricsResult.success) {
        setUsageMetrics(metricsResult.data!);
      }
    } catch (error) {
      console.error('Failed to load API data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateApiKey = async () => {
    if (!createForm.name.trim()) return;

    try {
      const result = await enterpriseService.createApiKey({
        organizationId: organizationId,
        name: createForm.name.trim(),
        description: createForm.description.trim(),
        permissions: createForm.permissions.reduce((acc, permission) => {
          acc[permission] = true;
          return acc;
        }, {} as Record<string, boolean>),
        rateLimit: createForm.rateLimit,
        expires_at: createForm.expiresAt || null,
      });
      
      if (result.success) {
        setShowCreateDialog(false);
        setCreateForm({
          name: '',
          description: '',
          permissions: ['read'],
          rateLimit: 1000,
          expiresAt: '',
        });
        loadApiData(); // Refresh data
      }
    } catch (error) {
      console.error('Failed to create API key:', error);
    }
  };

  const handleDeleteApiKey = async () => {
    if (!selectedKey) return;

    try {
      const result = await enterpriseService.deleteApiKey(selectedKey.id);
      if (result.success) {
        setShowDeleteDialog(false);
        setSelectedKey(null);
        loadApiData(); // Refresh data
      }
    } catch (error) {
      console.error('Failed to delete API key:', error);
    }
  };

  const handleToggleKeyStatus = async (keyId: string, isActive: boolean) => {
    try {
      const result = await enterpriseService.updateApiKeyStatus(keyId, !isActive);
      if (result.success) {
        loadApiData(); // Refresh data
      }
    } catch (error) {
      console.error('Failed to update API key status:', error);
    }
  };

  const handleCopyKey = async (keyId: string, secret: string) => {
    try {
      await navigator.clipboard.writeText(secret);
      setCopySuccess(keyId);
      setTimeout(() => setCopySuccess(''), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  const toggleKeyVisibility = (keyId: string) => {
    const newVisibleKeys = new Set(visibleKeys);
    if (newVisibleKeys.has(keyId)) {
      newVisibleKeys.delete(keyId);
    } else {
      newVisibleKeys.add(keyId);
    }
    setVisibleKeys(newVisibleKeys);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusBadge = (isActive: boolean, expiresAt?: string) => {
    if (expiresAt && new Date(expiresAt) < new Date()) {
      return <Badge className="bg-red-100 text-red-800">Expired</Badge>;
    }
    return isActive ? (
      <Badge className="bg-green-100 text-green-800">Active</Badge>
    ) : (
      <Badge className="bg-gray-100 text-gray-800">Inactive</Badge>
    );
  };

  const getPermissionBadge = (permission: string) => {
    const variants = {
      read: 'bg-blue-100 text-blue-800',
      write: 'bg-green-100 text-green-800',
      admin: 'bg-red-100 text-red-800',
      delete: 'bg-red-100 text-red-800',
    };
    
    return (
      <Badge className={variants[permission as keyof typeof variants] || 'bg-gray-100 text-gray-800'}>
        {permission.charAt(0).toUpperCase() + permission.slice(1)}
      </Badge>
    );
  };

  const maskApiKey = (key: string) => {
    if (key.length <= 8) return key;
    return `${key.slice(0, 4)}${'*'.repeat(key.length - 8)}${key.slice(-4)}`;
  };

  const availablePermissions = ['read', 'write', 'delete', 'admin'];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
            <Key className="h-6 w-6 text-purple-600" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">API Management</h1>
            <p className="text-gray-600">Manage API keys and monitor usage</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">
            {apiKeys.length} {apiKeys.length === 1 ? 'Key' : 'Keys'}
          </Badge>
          <Badge className="bg-green-100 text-green-800">
            {apiKeys.filter(k => k.is_active).length} Active
          </Badge>
        </div>
      </div>

      {/* API Usage Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{usageMetrics?.totalRequests || 0}</div>
            <p className="text-xs text-muted-foreground">
              +{usageMetrics?.requestsPerDay?.[usageMetrics.requestsPerDay.length - 1]?.count || 0} today
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {usageMetrics ? `${((usageMetrics.successfulRequests / usageMetrics.totalRequests) * 100).toFixed(1)}%` : '0%'}
            </div>
            <p className="text-xs text-muted-foreground">
              {usageMetrics?.failedRequests || 0} errors
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rate Limit</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {usageMetrics ? `${Math.min((usageMetrics.totalRequests / 10000) * 100, 100).toFixed(1)}%` : '0%'}
            </div>
            <p className="text-xs text-muted-foreground">
              Current usage
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Response</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {usageMetrics?.averageResponseTime ? `${usageMetrics.averageResponseTime}ms` : '0ms'}
            </div>
            <p className="text-xs text-muted-foreground">
              Response time
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="keys">API Keys</TabsTrigger>
          <TabsTrigger value="usage">Usage Analytics</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="keys" className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-medium">API Keys</h3>
              <p className="text-sm text-gray-500">Manage your API keys and permissions</p>
            </div>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create API Key
            </Button>
          </div>

          {apiKeys.length > 0 ? (
            <div className="space-y-4">
              {apiKeys.map((apiKey) => (
                <Card key={apiKey.id}>
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h4 className="text-lg font-medium">{apiKey.name}</h4>
                          {getStatusBadge(apiKey.is_active, apiKey.expires_at || undefined)}
                        </div>
                        {apiKey.description && (
                          <p className="text-sm text-gray-600 mb-3">{apiKey.description}</p>
                        )}
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                          <div>
                            <span className="text-xs font-medium text-gray-500">API Key</span>
                            <div className="flex items-center gap-2 mt-1">
                              <code className="text-sm bg-gray-100 px-2 py-1 rounded font-mono">
                                {visibleKeys.has(apiKey.id) 
                                  ? (apiKey.secret || apiKey.key_hash)
                                  : maskApiKey(apiKey.secret || apiKey.key_hash)
                                }
                              </code>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleKeyVisibility(apiKey.id)}
                              >
                                {visibleKeys.has(apiKey.id) ? (
                                  <EyeOff className="h-4 w-4" />
                                ) : (
                                  <Eye className="h-4 w-4" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleCopyKey(apiKey.id, apiKey.secret || apiKey.key_hash)}
                              >
                                {copySuccess === apiKey.id ? (
                                  <Check className="h-4 w-4 text-green-600" />
                                ) : (
                                  <Copy className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </div>
                          
                          <div>
                            <span className="text-xs font-medium text-gray-500">Permissions</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {Object.entries(apiKey.permissions)
                                .filter(([_, enabled]) => enabled)
                                .map(([permission]) => (
                                <span key={permission}>
                                  {getPermissionBadge(permission)}
                                </span>
                              ))}
                            </div>
                          </div>
                          
                          <div>
                            <span className="text-xs font-medium text-gray-500">Rate Limit</span>
                            <p className="text-sm mt-1">{apiKey.rate_limit}/hour</p>
                          </div>
                          
                          <div>
                            <span className="text-xs font-medium text-gray-500">Created</span>
                            <p className="text-sm mt-1">{formatDate(apiKey.created_at)}</p>
                          </div>
                        </div>
                        
                        {apiKey.expires_at && (
                          <div className="mb-4">
                            <span className="text-xs font-medium text-gray-500">Expires</span>
                            <p className="text-sm mt-1">{formatDate(apiKey.expires_at)}</p>
                          </div>
                        )}
                        
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <span>Last used: {apiKey.last_used_at ? formatDate(apiKey.last_used_at) : 'Never'}</span>
                          <span>Usage: {apiKey.usage_count || 0} requests</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleToggleKeyStatus(apiKey.id, apiKey.is_active)}
                        >
                          {apiKey.is_active ? (
                            <><Lock className="h-4 w-4 mr-1" />Disable</>
                          ) : (
                            <><Unlock className="h-4 w-4 mr-1" />Enable</>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedKey(apiKey);
                            setShowDeleteDialog(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="text-center py-12">
                <Key className="h-16 w-16 mx-auto mb-4 text-gray-400" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No API Keys</h3>
                <p className="text-gray-500 mb-4">
                  Create your first API key to start using the Tuma API
                </p>
                <Button onClick={() => setShowCreateDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create First API Key
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="usage" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Usage Analytics</CardTitle>
              <CardDescription>
                Monitor your API usage and performance metrics
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Alert>
                <BarChart3 className="h-4 w-4" />
                <AlertDescription>
                  Detailed usage analytics and charts are coming soon. You'll be able to view request patterns, error rates, and performance metrics.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>API Settings</CardTitle>
              <CardDescription>
                Configure global API settings and security policies
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Alert>
                <Settings className="h-4 w-4" />
                <AlertDescription>
                  API configuration settings are coming soon. You'll be able to set global rate limits, security policies, and webhook endpoints.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create API Key Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create API Key</DialogTitle>
            <DialogDescription>
              Generate a new API key for accessing the Tuma API
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Name</label>
              <Input
                placeholder="Enter API key name"
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Input
                placeholder="Enter description (optional)"
                value={createForm.description}
                onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Permissions</label>
              <div className="flex flex-wrap gap-2 mt-2">
                {availablePermissions.map((permission) => (
                  <label key={permission} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={createForm.permissions.includes(permission)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setCreateForm({
                            ...createForm,
                            permissions: [...createForm.permissions, permission],
                          });
                        } else {
                          setCreateForm({
                            ...createForm,
                            permissions: createForm.permissions.filter(p => p !== permission),
                          });
                        }
                      }}
                    />
                    <span className="text-sm">{permission.charAt(0).toUpperCase() + permission.slice(1)}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Rate Limit (requests/hour)</label>
              <Input
                type="number"
                placeholder="1000"
                value={createForm.rateLimit}
                onChange={(e) => setCreateForm({ ...createForm, rateLimit: parseInt(e.target.value) || 1000 })}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Expiration Date (optional)</label>
              <Input
                type="datetime-local"
                value={createForm.expiresAt}
                onChange={(e) => setCreateForm({ ...createForm, expiresAt: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateApiKey} disabled={!createForm.name.trim() || createForm.permissions.length === 0}>
              Create API Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete API Key Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete API Key</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this API key? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {selectedKey && (
            <div className="py-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-medium">{selectedKey.name}</h4>
                <p className="text-sm text-gray-600">{selectedKey.description}</p>
                <p className="text-xs text-gray-500 mt-2">
                  Created: {formatDate(selectedKey.created_at)}
                </p>
              </div>
            </div>
          )}
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Applications using this API key will immediately lose access.
            </AlertDescription>
          </Alert>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteApiKey}>
              Delete API Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ApiManagement;