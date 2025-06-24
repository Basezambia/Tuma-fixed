import React, { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Building2,
  Users,
  Shield,
  Key,
  BarChart3,
  Gift,
  Settings,
  Crown,
  Zap,
  Globe,
  Lock,
} from 'lucide-react';
import { OrganizationManagement } from '../components/OrganizationManagement';
import { ReferralSystem } from '../components/ReferralSystem';
import { PrivacySettings } from '../components/PrivacySettings';
import { ApiManagement } from '../components/ApiManagement';
import { enterpriseService } from '../lib/enterprise-service';
import { Organization, UserOrganization } from '../types/enterprise';

const Enterprise = () => {
  const { address: userAddress } = useAccount();
  const [activeTab, setActiveTab] = useState('organization');
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [userOrganizations, setUserOrganizations] = useState<UserOrganization[]>([]);
  const [selectedOrganization, setSelectedOrganization] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userAddress) {
      loadUserData();
    }
  }, [userAddress]);

  const loadUserData = async () => {
    if (!userAddress) return;
    
    setLoading(true);
    try {
      // Load user's organizations
      const userOrgsResult = await enterpriseService.getUserOrganizations(userAddress);
      if (userOrgsResult.success) {
        setUserOrganizations(userOrgsResult.data!);
        
        // Load organization details
        const orgPromises = userOrgsResult.data!.map(userOrg => 
          enterpriseService.getOrganization(userOrg.organization_id)
        );
        const orgResults = await Promise.all(orgPromises);
        const orgs = orgResults
          .filter(result => result.success)
          .map(result => result.data!)
          .filter(Boolean);
        
        setOrganizations(orgs);
        
        // Set default selected organization
        if (orgs.length > 0) {
          setSelectedOrganization(orgs[0].id);
        }
      }
    } catch (error) {
      console.error('Failed to load user data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getCurrentUserRole = () => {
    if (!selectedOrganization) return 'viewer';
    const userOrg = userOrganizations.find(uo => uo.organization_id === selectedOrganization);
    return userOrg?.role || 'viewer';
  };

  const getSelectedOrganization = () => {
    return organizations.find(org => org.id === selectedOrganization);
  };

  if (!userAddress) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center py-12">
            <Building2 className="h-16 w-16 mx-auto mb-4 text-gray-400" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Connect Your Wallet
            </h2>
            <p className="text-gray-600 dark:text-gray-300">
              Please connect your wallet to access enterprise features
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
                Enterprise Hub
              </h1>
              <p className="text-gray-600 dark:text-gray-300">
                Manage your organizations, teams, and enterprise features
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                <Crown className="h-3 w-3 mr-1" />
                Enterprise
              </Badge>
              {selectedOrganization && (
                <Badge variant="outline">
                  {getCurrentUserRole().charAt(0).toUpperCase() + getCurrentUserRole().slice(1)}
                </Badge>
              )}
            </div>
          </div>

          {/* Organization Selector */}
          {organizations.length > 0 && (
            <div className="mt-6">
              <div className="flex flex-wrap gap-2">
                {organizations.map((org) => (
                  <Button
                    key={org.id}
                    variant={selectedOrganization === org.id ? 'default' : 'outline'}
                    onClick={() => setSelectedOrganization(org.id)}
                    className="flex items-center gap-2"
                  >
                    <Building2 className="h-4 w-4" />
                    {org.name}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Main Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 lg:grid-cols-5">
            <TabsTrigger value="organization" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              <span className="hidden sm:inline">Organization</span>
            </TabsTrigger>
            <TabsTrigger value="referrals" className="flex items-center gap-2">
              <Gift className="h-4 w-4" />
              <span className="hidden sm:inline">Referrals</span>
            </TabsTrigger>
            <TabsTrigger value="privacy" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              <span className="hidden sm:inline">Privacy</span>
            </TabsTrigger>
            <TabsTrigger value="api" className="flex items-center gap-2">
              <Key className="h-4 w-4" />
              <span className="hidden sm:inline">API</span>
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Settings</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="organization" className="space-y-6">
            {selectedOrganization ? (
              <OrganizationManagement 
                userId={userAddress} 
                organizationId={selectedOrganization} 
              />
            ) : (
              <Card>
                <CardContent className="text-center py-12">
                  <Building2 className="h-16 w-16 mx-auto mb-4 text-gray-400" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                    No Organization Selected
                  </h3>
                  <p className="text-gray-500 dark:text-gray-400 mb-4">
                    Create or join an organization to access team features
                  </p>
                  <Button>
                    <Building2 className="h-4 w-4 mr-2" />
                    Create Organization
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="referrals" className="space-y-6">
            <ReferralSystem userId={userAddress} />
          </TabsContent>

          <TabsContent value="privacy" className="space-y-6">
            <PrivacySettings userId={userAddress} />
          </TabsContent>

          <TabsContent value="api" className="space-y-6">
            <ApiManagement userId={userAddress} organizationId={selectedOrganization} />
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Enterprise Settings */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5" />
                    Enterprise Settings
                  </CardTitle>
                  <CardDescription>
                    Configure your enterprise preferences
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium">Multi-Factor Authentication</span>
                      <p className="text-xs text-gray-500">Enhanced security for enterprise accounts</p>
                    </div>
                    <Badge className="bg-green-100 text-green-800">Enabled</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium">Audit Logging</span>
                      <p className="text-xs text-gray-500">Track all enterprise activities</p>
                    </div>
                    <Badge className="bg-green-100 text-green-800">Active</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium">Data Retention</span>
                      <p className="text-xs text-gray-500">Automatic data lifecycle management</p>
                    </div>
                    <Badge variant="outline">90 Days</Badge>
                  </div>
                </CardContent>
              </Card>

              {/* Billing & Usage */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5" />
                    Billing & Usage
                  </CardTitle>
                  <CardDescription>
                    Monitor your enterprise usage and billing
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Current Plan</span>
                    <Badge className="bg-purple-100 text-purple-800">
                      <Crown className="h-3 w-3 mr-1" />
                      Enterprise Pro
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Storage Used</span>
                    <span className="text-sm text-gray-600">2.4 GB / 100 GB</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">API Calls</span>
                    <span className="text-sm text-gray-600">1,247 / 10,000</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Team Members</span>
                    <span className="text-sm text-gray-600">8 / 25</span>
                  </div>
                </CardContent>
              </Card>

              {/* Security Overview */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Lock className="h-5 w-5" />
                    Security Overview
                  </CardTitle>
                  <CardDescription>
                    Your enterprise security status
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Security Score</span>
                    <Badge className="bg-green-100 text-green-800">95/100</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Zero-Knowledge Encryption</span>
                    <Badge className="bg-green-100 text-green-800">Active</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Key Rotation</span>
                    <Badge variant="outline">30 Days</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Compliance</span>
                    <Badge className="bg-blue-100 text-blue-800">SOC 2 Type II</Badge>
                  </div>
                </CardContent>
              </Card>

              {/* Global Settings */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="h-5 w-5" />
                    Global Settings
                  </CardTitle>
                  <CardDescription>
                    Multi-national and localization settings
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Primary Region</span>
                    <Badge variant="outline">US East</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Currency</span>
                    <Badge variant="outline">USD</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Language</span>
                    <Badge variant="outline">English</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Time Zone</span>
                    <Badge variant="outline">UTC-5</Badge>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Enterprise;