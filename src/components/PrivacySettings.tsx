import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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
  Shield,
  Key,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Download,
  Upload,
  Copy,
  Check,
  AlertTriangle,
  Info,
  Settings,
  FileKey,
  UserCheck,
  Clock,
  Trash2,
  RefreshCw,
  QrCode,
  Fingerprint,
} from 'lucide-react';
import { zkPrivacyService } from '../lib/zk-privacy-service';
import { PrivacySettings as PrivacySettingsType, ZKKeyPair } from '../types/enterprise';

interface PrivacySettingsProps {
  userId: string;
}

interface KeyExportData {
  publicKey: string;
  privateKey: string;
  userId: string;
  exportedAt: string;
}

export function PrivacySettings({ userId }: PrivacySettingsProps) {
  const [settings, setSettings] = useState<PrivacySettingsType | null>(null);
  const [keyPair, setKeyPair] = useState<ZKKeyPair | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);
  const [exportData, setExportData] = useState<string>('');
  const [importData, setImportData] = useState<string>('');
  const [copySuccess, setCopySuccess] = useState(false);
  const [importError, setImportError] = useState<string>('');

  useEffect(() => {
    loadPrivacyData();
  }, [userId]);

  const loadPrivacyData = async () => {
    setLoading(true);
    try {
      // Load privacy settings
      const settingsResult = await zkPrivacyService.getPrivacySettings(userId);
      if (settingsResult.success) {
        setSettings(settingsResult.data!);
      }

      // Load or generate key pair
      const keyResult = await zkPrivacyService.getOrGenerateKeyPair(userId);
      if (keyResult.success) {
        setKeyPair(keyResult.data!);
      }
    } catch (error) {
      console.error('Failed to load privacy data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateSettings = async (newSettings: Partial<PrivacySettingsType>) => {
    if (!settings) return;

    try {
      const updatedSettings = { ...settings, ...newSettings };
      const result = await zkPrivacyService.updatePrivacySettings(userId, updatedSettings);
      
      if (result.success) {
        setSettings(updatedSettings);
      }
    } catch (error) {
      console.error('Failed to update privacy settings:', error);
    }
  };

  const handleExportKeys = async () => {
    if (!keyPair) return;

    try {
      const exportResult = await zkPrivacyService.exportKeyPair(userId);
      if (exportResult.success) {
        const exportData: KeyExportData = {
          publicKey: exportResult.data!.publicKey,
          privateKey: exportResult.data!.privateKey,
          userId,
          exportedAt: new Date().toISOString(),
        };
        
        setExportData(JSON.stringify(exportData, null, 2));
        setShowExportDialog(true);
      }
    } catch (error) {
      console.error('Failed to export keys:', error);
    }
  };

  const handleImportKeys = async () => {
    if (!importData.trim()) return;

    try {
      const parsedData: KeyExportData = JSON.parse(importData.trim());
      
      if (!parsedData.publicKey || !parsedData.privateKey) {
        setImportError('Invalid key data format');
        return;
      }

      const result = await zkPrivacyService.importKeyPair(userId, {
        publicKey: parsedData.publicKey,
        privateKey: parsedData.privateKey,
      });
      
      if (result.success) {
        setShowImportDialog(false);
        setImportData('');
        setImportError('');
        loadPrivacyData(); // Refresh data
      } else {
        setImportError('Failed to import keys');
      }
    } catch (error) {
      setImportError('Invalid JSON format');
    }
  };

  const handleRegenerateKeys = async () => {
    try {
      const result = await zkPrivacyService.getOrGenerateKeyPair(userId);
      if (result.success) {
        setShowRegenerateDialog(false);
        loadPrivacyData(); // Refresh data
      }
    } catch (error) {
      console.error('Failed to regenerate keys:', error);
    }
  };

  const handleCopyExportData = async () => {
    try {
      await navigator.clipboard.writeText(exportData);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  const downloadExportData = () => {
    const blob = new Blob([exportData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tuma-keys-${userId}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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

  const getEncryptionLevelBadge = (level: string) => {
    const variants = {
      basic: 'bg-yellow-100 text-yellow-800',
      standard: 'bg-blue-100 text-blue-800',
      advanced: 'bg-green-100 text-green-800',
      maximum: 'bg-purple-100 text-purple-800',
    };
    
    return (
      <Badge className={variants[level as keyof typeof variants] || 'bg-gray-100 text-gray-800'}>
        {level.charAt(0).toUpperCase() + level.slice(1)}
      </Badge>
    );
  };

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
          <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
            <Shield className="h-6 w-6 text-green-600" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Privacy & Security</h1>
            <p className="text-gray-600">Manage your zero-knowledge privacy settings</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {settings?.encryption_enabled ? (
            <Badge className="bg-green-100 text-green-800">
              <Lock className="h-3 w-3 mr-1" />
              Protected
            </Badge>
          ) : (
            <Badge className="bg-red-100 text-red-800">
              <Unlock className="h-3 w-3 mr-1" />
              Unprotected
            </Badge>
          )}
          {keyPair && (
            <Badge variant="outline">
              <Key className="h-3 w-3 mr-1" />
              Keys Active
            </Badge>
          )}
        </div>
      </div>

      {/* Privacy Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Encryption Status</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {settings?.encryption_enabled ? 'Active' : 'Inactive'}
            </div>
            <p className="text-xs text-muted-foreground">
              {settings?.encryption_enabled ? 'Files are encrypted' : 'Files are not encrypted'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Encryption Level</CardTitle>
            <Fingerprint className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {settings?.encryption_level || 'Standard'}
            </div>
            <p className="text-xs text-muted-foreground">
              Current security level
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Key Pair Status</CardTitle>
            <Key className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {keyPair ? 'Generated' : 'Missing'}
            </div>
            <p className="text-xs text-muted-foreground">
              {keyPair ? formatDate(keyPair.created_at) : 'No keys found'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="encryption">Encryption</TabsTrigger>
          <TabsTrigger value="keys">Key Management</TabsTrigger>
          <TabsTrigger value="sharing">Secure Sharing</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Privacy Summary */}
            <Card>
              <CardHeader>
                <CardTitle>Privacy Summary</CardTitle>
                <CardDescription>
                  Your current privacy and security configuration
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Zero-Knowledge Encryption</span>
                  <Switch
                    checked={settings?.encryption_enabled || false}
                    onCheckedChange={(checked) => handleUpdateSettings({ encryption_enabled: checked })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Auto-Delete Expired Files</span>
                  <Switch
                    checked={settings?.auto_delete_expired || false}
                    onCheckedChange={(checked) => handleUpdateSettings({ auto_delete_expired: checked })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Require Proof for Access</span>
                  <Switch
                    checked={settings?.require_proof_for_access || false}
                    onCheckedChange={(checked) => handleUpdateSettings({ require_proof_for_access: checked })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Anonymous Sharing</span>
                  <Switch
                    checked={settings?.anonymous_sharing || false}
                    onCheckedChange={(checked) => handleUpdateSettings({ anonymous_sharing: checked })}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Security Recommendations */}
            <Card>
              <CardHeader>
                <CardTitle>Security Recommendations</CardTitle>
                <CardDescription>
                  Improve your privacy and security posture
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {!settings?.encryption_enabled && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      Enable zero-knowledge encryption to protect your files
                    </AlertDescription>
                  </Alert>
                )}
                {!keyPair && (
                  <Alert>
                    <Key className="h-4 w-4" />
                    <AlertDescription>
                      Generate encryption keys to enable secure file sharing
                    </AlertDescription>
                  </Alert>
                )}
                {settings?.encryption_level === 'basic' && (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      Consider upgrading to advanced encryption for better security
                    </AlertDescription>
                  </Alert>
                )}
                <div className="pt-2">
                  <Button variant="outline" className="w-full">
                    <Shield className="h-4 w-4 mr-2" />
                    Run Security Audit
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="encryption" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Encryption Settings</CardTitle>
              <CardDescription>
                Configure how your files are encrypted and protected
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Encryption Level</label>
                  <Select
                    value={settings?.encryption_level || 'standard'}
                    onValueChange={(value) => handleUpdateSettings({ encryption_level: value as any })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="basic">Basic (AES-128)</SelectItem>
                      <SelectItem value="standard">Standard (AES-256)</SelectItem>
                      <SelectItem value="advanced">Advanced (AES-256 + RSA)</SelectItem>
                      <SelectItem value="maximum">Maximum (Multi-layer)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500 mt-1">
                    Higher levels provide better security but may impact performance
                  </p>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Default File Expiration</label>
                  <Select
                    value={settings?.default_expiration_days?.toString() || '30'}
                    onValueChange={(value) => handleUpdateSettings({ default_expiration_days: parseInt(value) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 Day</SelectItem>
                      <SelectItem value="7">1 Week</SelectItem>
                      <SelectItem value="30">1 Month</SelectItem>
                      <SelectItem value="90">3 Months</SelectItem>
                      <SelectItem value="365">1 Year</SelectItem>
                      <SelectItem value="0">Never</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500 mt-1">
                    Files will be automatically deleted after this period
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium">Client-Side Encryption</span>
                      <p className="text-xs text-gray-500">Encrypt files before uploading</p>
                    </div>
                    <Switch
                      checked={settings?.client_side_encryption || false}
                      onCheckedChange={(checked) => handleUpdateSettings({ client_side_encryption: checked })}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium">Metadata Protection</span>
                      <p className="text-xs text-gray-500">Hide file names and metadata</p>
                    </div>
                    <Switch
                      checked={settings?.metadata_protection || false}
                      onCheckedChange={(checked) => handleUpdateSettings({ metadata_protection: checked })}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium">Zero-Knowledge Proofs</span>
                      <p className="text-xs text-gray-500">Verify access without revealing data</p>
                    </div>
                    <Switch
                      checked={settings?.zero_knowledge_proofs || false}
                      onCheckedChange={(checked) => handleUpdateSettings({ zero_knowledge_proofs: checked })}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="keys" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Key Information */}
            <Card>
              <CardHeader>
                <CardTitle>Encryption Keys</CardTitle>
                <CardDescription>
                  Manage your cryptographic key pair
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {keyPair ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Status</span>
                      <Badge className="bg-green-100 text-green-800">Active</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Created</span>
                      <span className="text-sm text-gray-600">
                        {formatDate(keyPair.created_at)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Public Key</span>
                      <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                        {keyPair.publicKey.slice(0, 16)}...
                      </code>
                    </div>
                    <div className="pt-2 space-y-2">
                      <Button onClick={handleExportKeys} className="w-full" variant="outline">
                        <Download className="h-4 w-4 mr-2" />
                        Export Keys
                      </Button>
                      <Button
                        onClick={() => setShowRegenerateDialog(true)}
                        className="w-full"
                        variant="outline"
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Regenerate Keys
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <Key className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                    <h3 className="text-sm font-medium text-gray-900 mb-1">No Keys Found</h3>
                    <p className="text-xs text-gray-500 mb-4">
                      Generate encryption keys to enable secure features
                    </p>
                    <Button onClick={() => handleRegenerateKeys()} className="w-full">
                      <Key className="h-4 w-4 mr-2" />
                      Generate Keys
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Key Management Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Key Management</CardTitle>
                <CardDescription>
                  Import, export, and backup your keys
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  onClick={() => setShowImportDialog(true)}
                  className="w-full justify-start"
                  variant="outline"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Import Keys
                </Button>
                <Button
                  onClick={handleExportKeys}
                  className="w-full justify-start"
                  variant="outline"
                  disabled={!keyPair}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export Keys
                </Button>
                <Button
                  className="w-full justify-start"
                  variant="outline"
                  disabled={!keyPair}
                >
                  <QrCode className="h-4 w-4 mr-2" />
                  Show QR Code
                </Button>
                <Button
                  onClick={() => setShowRegenerateDialog(true)}
                  className="w-full justify-start"
                  variant="outline"
                  disabled={!keyPair}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Regenerate Keys
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Security Warning */}
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Important:</strong> Keep your private key secure and backed up. If you lose it, you won't be able to decrypt your files. Never share your private key with anyone.
            </AlertDescription>
          </Alert>
        </TabsContent>

        <TabsContent value="sharing" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Secure Sharing Settings</CardTitle>
              <CardDescription>
                Configure how you share files securely with others
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Alert>
                <Settings className="h-4 w-4" />
                <AlertDescription>
                  Secure sharing features are coming soon. You'll be able to share files with zero-knowledge proofs, time-limited access, and more.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Export Keys Dialog */}
      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Export Encryption Keys</DialogTitle>
            <DialogDescription>
              Save your encryption keys securely. Keep this information safe and private.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>Warning:</strong> Anyone with access to your private key can decrypt your files. Store this information securely.
              </AlertDescription>
            </Alert>
            <div>
              <label className="text-sm font-medium mb-2 block">Key Data (JSON)</label>
              <textarea
                className="w-full h-64 p-3 border rounded-md font-mono text-xs"
                value={exportData}
                readOnly
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExportDialog(false)}>
              Close
            </Button>
            <Button onClick={handleCopyExportData}>
              {copySuccess ? (
                <><Check className="h-4 w-4 mr-2" />Copied!</>
              ) : (
                <><Copy className="h-4 w-4 mr-2" />Copy to Clipboard</>
              )}
            </Button>
            <Button onClick={downloadExportData}>
              <Download className="h-4 w-4 mr-2" />
              Download File
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Keys Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import Encryption Keys</DialogTitle>
            <DialogDescription>
              Import your encryption keys from a backup
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {importError && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{importError}</AlertDescription>
              </Alert>
            )}
            <div>
              <label className="text-sm font-medium mb-2 block">Key Data (JSON)</label>
              <textarea
                className="w-full h-32 p-3 border rounded-md font-mono text-xs"
                placeholder="Paste your exported key data here..."
                value={importData}
                onChange={(e) => {
                  setImportData(e.target.value);
                  setImportError('');
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImportDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleImportKeys} disabled={!importData.trim()}>
              Import Keys
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Regenerate Keys Dialog */}
      <Dialog open={showRegenerateDialog} onOpenChange={setShowRegenerateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Regenerate Encryption Keys</DialogTitle>
            <DialogDescription>
              This will create new encryption keys and invalidate the old ones.
            </DialogDescription>
          </DialogHeader>
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Warning:</strong> Regenerating keys will make previously encrypted files inaccessible unless you have backed up your current keys.
            </AlertDescription>
          </Alert>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRegenerateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleRegenerateKeys} variant="destructive">
              <RefreshCw className="h-4 w-4 mr-2" />
              Regenerate Keys
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default PrivacySettings;