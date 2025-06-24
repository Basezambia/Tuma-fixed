import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Copy,
  Share2,
  Users,
  Gift,
  TrendingUp,
  DollarSign,
  Calendar,
  CheckCircle,
  Clock,
  ExternalLink,
  Mail,
  MessageSquare,
  Twitter,
  Facebook,
  Linkedin,
  QrCode,
} from 'lucide-react';
import { enterpriseService } from '../lib/enterprise-service';
import { UserReferral, UserDiscount } from '../types/enterprise';

interface ReferralSystemProps {
  userId: string;
}

interface ReferralStats {
  totalReferrals: number;
  successfulReferrals: number;
  totalEarnings: number;
  pendingEarnings: number;
  conversionRate: number;
  currentTier: string;
  nextTierProgress: number;
}

interface ReferralTier {
  name: string;
  minReferrals: number;
  commissionRate: number;
  bonusReward: number;
  benefits: string[];
}

const referralTiers: ReferralTier[] = [
  {
    name: 'Bronze',
    minReferrals: 0,
    commissionRate: 10,
    bonusReward: 0,
    benefits: ['10% commission on referrals', 'Basic analytics'],
  },
  {
    name: 'Silver',
    minReferrals: 10,
    commissionRate: 15,
    bonusReward: 50,
    benefits: ['15% commission on referrals', 'Priority support', 'Advanced analytics'],
  },
  {
    name: 'Gold',
    minReferrals: 25,
    commissionRate: 20,
    bonusReward: 100,
    benefits: ['20% commission on referrals', 'Dedicated account manager', 'Custom referral codes'],
  },
  {
    name: 'Platinum',
    minReferrals: 50,
    commissionRate: 25,
    bonusReward: 250,
    benefits: ['25% commission on referrals', 'White-label options', 'API access'],
  },
];

export function ReferralSystem({ userId }: ReferralSystemProps) {
  const [referrals, setReferrals] = useState<UserReferral[]>([]);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [referralCode, setReferralCode] = useState<string>('');
  const [customCode, setCustomCode] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadReferralData();
  }, [userId]);

  const loadReferralData = async () => {
    setLoading(true);
    try {
      // Load user referrals
      const referralsResult = await enterpriseService.getUserReferrals(userId);
      if (referralsResult.success) {
        setReferrals(referralsResult.data!);
      }

      // Generate or get existing referral code
      const codeResult = await enterpriseService.generateReferralCode(userId);
      if (codeResult.success) {
        setReferralCode(codeResult.data!);
      }

      // Calculate stats
      const calculatedStats = calculateStats(referralsResult.data || []);
      setStats(calculatedStats);
    } catch (error) {
      console.error('Failed to load referral data:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (referralData: UserReferral[]): ReferralStats => {
    const totalReferrals = referralData.length;
    const successfulReferrals = referralData.filter(r => r.status === 'completed').length;
    const totalEarnings = referralData
      .filter(r => r.status === 'completed')
      .reduce((sum, r) => sum + r.commission_earned, 0);
    const pendingEarnings = referralData
      .filter(r => r.status === 'pending')
      .reduce((sum, r) => sum + r.commission_earned, 0);
    const conversionRate = totalReferrals > 0 ? (successfulReferrals / totalReferrals) * 100 : 0;

    // Determine current tier
    const currentTier = referralTiers
      .slice()
      .reverse()
      .find(tier => successfulReferrals >= tier.minReferrals) || referralTiers[0];
    
    const nextTier = referralTiers.find(tier => tier.minReferrals > successfulReferrals);
    const nextTierProgress = nextTier 
      ? (successfulReferrals / nextTier.minReferrals) * 100
      : 100;

    return {
      totalReferrals,
      successfulReferrals,
      totalEarnings,
      pendingEarnings,
      conversionRate,
      currentTier: currentTier.name,
      nextTierProgress,
    };
  };

  const copyReferralLink = async () => {
    const referralLink = `${window.location.origin}/signup?ref=${referralCode}`;
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy link:', error);
    }
  };

  const shareOnSocial = (platform: string) => {
    const referralLink = `${window.location.origin}/signup?ref=${referralCode}`;
    const message = "Check out Tuma - the best platform for secure file sharing and storage!";
    
    const urls = {
      twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(message)}&url=${encodeURIComponent(referralLink)}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(referralLink)}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(referralLink)}`,
      email: `mailto:?subject=${encodeURIComponent('Join Tuma')}&body=${encodeURIComponent(`${message} ${referralLink}`)}`,
    };

    if (urls[platform as keyof typeof urls]) {
      window.open(urls[platform as keyof typeof urls], '_blank');
    }
  };

  const createCustomCode = async () => {
    if (!customCode.trim()) return;
    
    try {
      const result = await enterpriseService.createCustomReferralCode(userId, customCode.trim());
      if (result.success) {
        setReferralCode(customCode.trim());
        setCustomCode('');
      }
    } catch (error) {
      console.error('Failed to create custom code:', error);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      pending: 'bg-yellow-100 text-yellow-800',
      completed: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800',
    };
    
    return (
      <Badge className={variants[status as keyof typeof variants] || 'bg-gray-100 text-gray-800'}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
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

  const currentTierData = referralTiers.find(tier => tier.name === stats?.currentTier) || referralTiers[0];
  const nextTierData = referralTiers.find(tier => tier.minReferrals > (stats?.successfulReferrals || 0));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Referral Program</h1>
          <p className="text-gray-600 mt-1">
            Earn rewards by inviting friends to join Tuma
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-blue-100 text-blue-800">
            {stats?.currentTier} Tier
          </Badge>
          <Badge className="bg-green-100 text-green-800">
            {currentTierData.commissionRate}% Commission
          </Badge>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Referrals</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalReferrals || 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.successfulReferrals || 0} successful
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Earnings</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(stats?.totalEarnings || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(stats?.pendingEarnings || 0)} pending
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(stats?.conversionRate || 0).toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">
              Industry avg: 12%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Next Tier Progress</CardTitle>
            <Gift className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {nextTierData ? `${stats?.successfulReferrals || 0}/${nextTierData.minReferrals}` : 'Max Tier'}
            </div>
            <Progress value={stats?.nextTierProgress || 100} className="mt-2" />
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="share">Share & Earn</TabsTrigger>
          <TabsTrigger value="referrals">My Referrals</TabsTrigger>
          <TabsTrigger value="tiers">Tier Benefits</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Current Tier Benefits */}
            <Card>
              <CardHeader>
                <CardTitle>Current Tier: {stats?.currentTier}</CardTitle>
                <CardDescription>
                  Your current benefits and rewards
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  {currentTierData.benefits.map((benefit, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span className="text-sm">{benefit}</span>
                    </div>
                  ))}
                </div>
                {nextTierData && (
                  <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                    <p className="text-sm font-medium text-blue-900">
                      Next Tier: {nextTierData.name}
                    </p>
                    <p className="text-xs text-blue-700">
                      Refer {nextTierData.minReferrals - (stats?.successfulReferrals || 0)} more users to unlock {nextTierData.commissionRate}% commission
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quick Share */}
            <Card>
              <CardHeader>
                <CardTitle>Quick Share</CardTitle>
                <CardDescription>
                  Share your referral link instantly
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    value={`${window.location.origin}/signup?ref=${referralCode}`}
                    readOnly
                    className="flex-1"
                  />
                  <Button onClick={copyReferralLink} variant="outline">
                    {copied ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => shareOnSocial('twitter')}
                    className="flex flex-col items-center gap-1 h-auto py-3"
                  >
                    <Twitter className="h-4 w-4" />
                    <span className="text-xs">Twitter</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => shareOnSocial('facebook')}
                    className="flex flex-col items-center gap-1 h-auto py-3"
                  >
                    <Facebook className="h-4 w-4" />
                    <span className="text-xs">Facebook</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => shareOnSocial('linkedin')}
                    className="flex flex-col items-center gap-1 h-auto py-3"
                  >
                    <Linkedin className="h-4 w-4" />
                    <span className="text-xs">LinkedIn</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => shareOnSocial('email')}
                    className="flex flex-col items-center gap-1 h-auto py-3"
                  >
                    <Mail className="h-4 w-4" />
                    <span className="text-xs">Email</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Referral Activity</CardTitle>
              <CardDescription>
                Your latest referral conversions
              </CardDescription>
            </CardHeader>
            <CardContent>
              {referrals.length > 0 ? (
                <div className="space-y-3">
                  {referrals.slice(0, 5).map((referral) => (
                    <div key={referral.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                          <Users className="h-4 w-4 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-medium">Referral #{referral.id.slice(0, 8)}</p>
                          <p className="text-sm text-gray-500">
                            {formatDate(referral.created_at)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-medium">
                          {formatCurrency(referral.commission_earned)}
                        </span>
                        {getStatusBadge(referral.status)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No referrals yet</p>
                  <p className="text-sm">Start sharing your link to earn rewards!</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="share" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Referral Link */}
            <Card>
              <CardHeader>
                <CardTitle>Your Referral Link</CardTitle>
                <CardDescription>
                  Share this link to earn {currentTierData.commissionRate}% commission
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm font-mono break-all">
                    {window.location.origin}/signup?ref={referralCode}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button onClick={copyReferralLink} className="flex-1">
                    {copied ? <CheckCircle className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                    {copied ? 'Copied!' : 'Copy Link'}
                  </Button>
                  <Button variant="outline">
                    <QrCode className="h-4 w-4 mr-2" />
                    QR Code
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Custom Referral Code */}
            <Card>
              <CardHeader>
                <CardTitle>Custom Referral Code</CardTitle>
                <CardDescription>
                  Create a personalized referral code (Gold tier and above)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter custom code"
                    value={customCode}
                    onChange={(e) => setCustomCode(e.target.value)}
                    disabled={currentTierData.name === 'Bronze' || currentTierData.name === 'Silver'}
                  />
                  <Button
                    onClick={createCustomCode}
                    disabled={!customCode.trim() || currentTierData.name === 'Bronze' || currentTierData.name === 'Silver'}
                  >
                    Create
                  </Button>
                </div>
                {(currentTierData.name === 'Bronze' || currentTierData.name === 'Silver') && (
                  <Alert>
                    <AlertDescription>
                      Custom referral codes are available for Gold tier and above.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Social Sharing */}
          <Card>
            <CardHeader>
              <CardTitle>Share on Social Media</CardTitle>
              <CardDescription>
                Reach more people by sharing on your favorite platforms
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Button
                  variant="outline"
                  onClick={() => shareOnSocial('twitter')}
                  className="flex items-center gap-2 h-auto py-4"
                >
                  <Twitter className="h-5 w-5 text-blue-400" />
                  <div className="text-left">
                    <div className="font-medium">Twitter</div>
                    <div className="text-xs text-gray-500">Share with followers</div>
                  </div>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => shareOnSocial('facebook')}
                  className="flex items-center gap-2 h-auto py-4"
                >
                  <Facebook className="h-5 w-5 text-blue-600" />
                  <div className="text-left">
                    <div className="font-medium">Facebook</div>
                    <div className="text-xs text-gray-500">Post to timeline</div>
                  </div>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => shareOnSocial('linkedin')}
                  className="flex items-center gap-2 h-auto py-4"
                >
                  <Linkedin className="h-5 w-5 text-blue-700" />
                  <div className="text-left">
                    <div className="font-medium">LinkedIn</div>
                    <div className="text-xs text-gray-500">Professional network</div>
                  </div>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => shareOnSocial('email')}
                  className="flex items-center gap-2 h-auto py-4"
                >
                  <Mail className="h-5 w-5 text-gray-600" />
                  <div className="text-left">
                    <div className="font-medium">Email</div>
                    <div className="text-xs text-gray-500">Send directly</div>
                  </div>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="referrals" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>All Referrals</CardTitle>
              <CardDescription>
                Track the status of all your referrals
              </CardDescription>
            </CardHeader>
            <CardContent>
              {referrals.length > 0 ? (
                <div className="space-y-4">
                  {referrals.map((referral) => (
                    <div key={referral.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                          <Users className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-medium">Referral #{referral.id.slice(0, 8)}</p>
                          <p className="text-sm text-gray-500">
                            Referred on {formatDate(referral.created_at)}
                          </p>
                          {referral.converted_at && (
                            <p className="text-sm text-green-600">
                              Converted on {formatDate(referral.converted_at)}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="font-medium">
                            {formatCurrency(referral.commission_earned)}
                          </p>
                          <p className="text-sm text-gray-500">
                            {currentTierData.commissionRate}% commission
                          </p>
                        </div>
                        {getStatusBadge(referral.status)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <Users className="h-16 w-16 mx-auto mb-4 opacity-50" />
                  <h3 className="text-lg font-medium mb-2">No referrals yet</h3>
                  <p className="mb-4">Start sharing your referral link to see your referrals here</p>
                  <Button onClick={() => setActiveTab('share')}>
                    <Share2 className="h-4 w-4 mr-2" />
                    Start Sharing
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tiers" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {referralTiers.map((tier, index) => (
              <Card key={tier.name} className={`relative ${tier.name === stats?.currentTier ? 'ring-2 ring-blue-500' : ''}`}>
                {tier.name === stats?.currentTier && (
                  <Badge className="absolute -top-2 left-1/2 transform -translate-x-1/2 bg-blue-500">
                    Current Tier
                  </Badge>
                )}
                <CardHeader className="text-center">
                  <CardTitle className="text-xl">{tier.name}</CardTitle>
                  <CardDescription>
                    {tier.minReferrals === 0 ? 'Starting tier' : `${tier.minReferrals}+ referrals`}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-blue-600">
                      {tier.commissionRate}%
                    </div>
                    <p className="text-sm text-gray-500">Commission Rate</p>
                  </div>
                  {tier.bonusReward > 0 && (
                    <div className="text-center p-2 bg-green-50 rounded">
                      <div className="text-lg font-bold text-green-600">
                        {formatCurrency(tier.bonusReward)}
                      </div>
                      <p className="text-xs text-green-700">Tier Bonus</p>
                    </div>
                  )}
                  <div className="space-y-2">
                    <p className="font-medium text-sm">Benefits:</p>
                    {tier.benefits.map((benefit, benefitIndex) => (
                      <div key={benefitIndex} className="flex items-start gap-2">
                        <CheckCircle className="h-3 w-3 text-green-500 mt-0.5 flex-shrink-0" />
                        <span className="text-xs">{benefit}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default ReferralSystem;