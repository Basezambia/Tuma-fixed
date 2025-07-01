import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Input } from './ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { 
  ShoppingCart, 
  Database, 
  TrendingUp, 
  Shield, 
  Globe, 
  Zap,
  CreditCard,
  Wallet,
  Download,
  Upload,
  Clock,
  CheckCircle,
  AlertCircle,
  Info
} from 'lucide-react';
import { toast } from 'sonner';
import { Checkout, CheckoutButton, CheckoutStatus } from '@coinbase/onchainkit/checkout';
import { useAccount } from 'wagmi';

const StorageMarketplace = ({ userId, walletAddress }) => {
  const { address } = useAccount();
  const [packages, setPackages] = useState([]);
  const [userStorage, setUserStorage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(null);
  const [customStorage, setCustomStorage] = useState('');
  const [customStorageAmount, setCustomStorageAmount] = useState('');
  const [customPricingData, setCustomPricingData] = useState(null);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState('idle');
  const [paymentError, setPaymentError] = useState(null);
  const [chargeId, setChargeId] = useState(null);
  const [currentPurchase, setCurrentPurchase] = useState(null);
  const [calculatedPrice, setCalculatedPrice] = useState(null);
  const [calculating, setCalculating] = useState(false);
  const [activeTab, setActiveTab] = useState('browse');
  const paymentMethod = 'usdc'; // Fixed to USDC

  useEffect(() => {
    if (userId && walletAddress) {
      fetchStorageData();
    }
  }, [userId, walletAddress]);

  const fetchStorageData = async () => {
    try {
      setLoading(true);
      
      // Fetch storage packages
      const packagesResponse = await fetch('/api/getStoragePackages?includeCustomPricing=true');
      const packagesData = await packagesResponse.json();
      
      if (packagesData.success) {
        setPackages(packagesData.packages);
        setCustomPricingData(packagesData.customPricingData);
      }

      // Fetch user storage info
      const userResponse = await fetch(`/api/getUserStorage?userId=${userId}&walletAddress=${walletAddress}&includeHistory=true`);
      const userData = await userResponse.json();
      
      if (userData.success) {
        setUserStorage(userData);
      }
    } catch (error) {
      console.error('Error fetching storage data:', error);
      toast.error('Failed to load storage information');
    } finally {
      setLoading(false);
    }
  };

  const calculateStoragePrice = async (storageMB) => {
    if (!storageMB || storageMB <= 0) {
      setCalculatedPrice(null);
      return;
    }

    try {
      setCalculating(true);
      const response = await fetch('/api/purchaseStorage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          walletAddress,
          customStorageMB: storageMB,
          dryRun: true
        })
      });

      const result = await response.json();
      if (result.success) {
        setCalculatedPrice({
          priceUSDC: result.price_usdc,
          storageGB: result.storage_gb,
          storageMB: result.storage_mb
        });
      } else {
        toast.error('Failed to calculate price');
      }
    } catch (error) {
      console.error('Error calculating price:', error);
      toast.error('Failed to calculate price');
    } finally {
      setCalculating(false);
    }
  };

  const handleCustomStorageChange = (value) => {
    setCustomStorage(value);
    const storageMB = parseInt(value);
    if (storageMB && storageMB > 0) {
      calculateStoragePrice(storageMB);
    } else {
      setCalculatedPrice(null);
    }
  };

  const chargeHandler = useCallback(async () => {
    try {
      if (!address) {
        throw new Error('Wallet not connected. Please connect your wallet to proceed with payment.');
      }

      if (!currentPurchase) {
        throw new Error('No purchase data available');
      }

      const fee = Number(currentPurchase.priceUSDC);
      if (isNaN(fee) || fee <= 0) {
        throw new Error('Invalid service fee amount');
      }

      setPaymentStatus('processing');
      setPaymentError(null);
      
      const requestBody = {
        amount: currentPurchase.priceUSDC,
        currency: 'USDC',
        name: 'Tuma Storage Credits',
        description: `Payment for ${currentPurchase.storageGB} GB storage credits`,
        metadata: { 
          sender: address, 
          storageGB: currentPurchase.storageGB,
          storageMB: currentPurchase.storageMB,
          type: 'storage_purchase',
          timestamp: new Date().toISOString(),
          ...(currentPurchase.packageId && { packageId: currentPurchase.packageId })
        }
      };
      
      const response = await fetch('/api/createCharge', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      const responseClone = response.clone();
      
      try {
        const data = await response.json();
        
        if (!data || !data.success || !data.data || !data.data.id) {
          console.error('Invalid response from payment service:', data);
          throw new Error('Invalid response from payment service');
        }
        
        setChargeId(data.data.id);
        setPaymentStatus('pending');
        
        return data.data.id;
        
      } catch (jsonError) {
        if (!response.ok) {
          let errorData;
          try {
            errorData = await responseClone.json();
          } catch (e) {
            throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
          }
          throw new Error(errorData?.message || `HTTP error! status: ${response.status}`);
        } else {
          throw new Error('Invalid response format from payment service');
        }
      }
      
    } catch (error) {
      console.error('Payment error:', error);
      const errorMessage = error.message || 'Failed to process payment';
      setPaymentStatus('error');
      setPaymentError(errorMessage);
      throw new Error(errorMessage);
    }
  }, [address, currentPurchase]);

  const handlePurchase = async (packageId, customStorageMB = null) => {
    try {
      setPurchasing(packageId || 'custom');
      
      // First calculate the price
      const purchaseData = {
        userId,
        walletAddress,
        paymentMethod,
        dryRun: true,
        ...(packageId ? { packageId } : { customStorageMB: parseInt(customStorageMB) })
      };

      const response = await fetch('/api/purchaseStorage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(purchaseData)
      });

      const result = await response.json();
      
      if (result.success) {
        // Set current purchase data for payment
        setCurrentPurchase({
          packageId,
          customStorageMB,
          priceUSDC: result.price_usdc,
          storageGB: result.storage_gb,
          storageMB: result.storage_mb
        });
        
        // Show payment dialog
        setShowPaymentDialog(true);
      } else {
        toast.error(result.error || 'Purchase failed');
      }
    } catch (error) {
      console.error('Purchase error:', error);
      toast.error('Failed to process purchase');
    } finally {
      setPurchasing(null);
    }
  };

  const handlePaymentSuccess = async () => {
    try {
      if (!currentPurchase) return;
      
      // Complete the actual purchase
      const purchaseData = {
        userId,
        walletAddress,
        paymentMethod,
        chargeId,
        ...(currentPurchase.packageId ? { packageId: currentPurchase.packageId } : { customStorageMB: currentPurchase.customStorageMB })
      };

      const response = await fetch('/api/purchaseStorage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(purchaseData)
      });

      const result = await response.json();
      
      if (result.success) {
        toast.success(`Storage credits purchased! ${result.storage_gb} GB added to your account.`);
        setShowPaymentDialog(false);
        setCurrentPurchase(null);
        setChargeId(null);
        setPaymentStatus('idle');
        await fetchStorageData();
      } else {
        toast.error(result.error || 'Failed to complete purchase');
      }
    } catch (error) {
      console.error('Error completing purchase:', error);
      toast.error('Failed to complete purchase');
    }
  };

  const formatBytes = (mb) => {
    if (mb >= 1024) {
      return `${(mb / 1024).toFixed(1)} GB`;
    }
    return `${mb} MB`;
  };

  const getUsageColor = (percentage) => {
    if (percentage >= 90) return 'text-red-600';
    if (percentage >= 70) return 'text-yellow-600';
    return 'text-green-600';
  };

  const calculateCustomStorageCost = (storageGB) => {
    if (!customPricingData || !customPricingData.sample_pricing) {
      return 0;
    }

    const MINIMUM_PRICE_USDC = 0.5; // Minimum price of 0.5 USDC
    
    // Find the closest sample size for interpolation
    const samples = customPricingData.sample_pricing;
    const targetGB = parseFloat(storageGB);
    
    // If exact match, return that price (with minimum enforcement)
    const exactMatch = samples.find(sample => sample.size_gb === targetGB);
    if (exactMatch) {
      return Math.max(exactMatch.price_usdc, MINIMUM_PRICE_USDC);
    }

    // Find two closest samples for interpolation
    const sortedSamples = samples.sort((a, b) => a.size_gb - b.size_gb);
    
    let calculatedPrice;
    
    // If smaller than smallest sample, use the rate of smallest sample
    if (targetGB < sortedSamples[0].size_gb) {
      calculatedPrice = targetGB * sortedSamples[0].price_per_gb;
    }
    // If larger than largest sample, use the rate of largest sample
    else if (targetGB > sortedSamples[sortedSamples.length - 1].size_gb) {
      calculatedPrice = targetGB * sortedSamples[sortedSamples.length - 1].price_per_gb;
    }
    // Interpolate between two closest samples
    else {
      let found = false;
      for (let i = 0; i < sortedSamples.length - 1; i++) {
        const lower = sortedSamples[i];
        const upper = sortedSamples[i + 1];
        
        if (targetGB >= lower.size_gb && targetGB <= upper.size_gb) {
          // Linear interpolation
          const ratio = (targetGB - lower.size_gb) / (upper.size_gb - lower.size_gb);
          const interpolatedRate = lower.price_per_gb + (upper.price_per_gb - lower.price_per_gb) * ratio;
          calculatedPrice = targetGB * interpolatedRate;
          found = true;
          break;
        }
      }
      
      if (!found) {
        // Fallback to average rate
        const avgRate = samples.reduce((sum, sample) => sum + sample.price_per_gb, 0) / samples.length;
        calculatedPrice = targetGB * avgRate;
      }
    }
    
    // Enforce minimum price
    return Math.max(calculatedPrice, MINIMUM_PRICE_USDC);
  };

  const handleCustomStoragePurchase = async (storageGB) => {
    const storageMB = Math.round(parseFloat(storageGB) * 1024);
    await handlePurchase(null, storageMB);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2">Loading storage marketplace...</span>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-gray-900">Storage Marketplace</h1>
        <p className="text-gray-600">Purchase decentralized storage credits with USDC - powered by Arweave</p>
        <div className="flex items-center justify-center space-x-4 text-sm text-gray-500">
          <span className="flex items-center"><Database className="w-4 h-4 mr-1" />Permanent Storage</span>
          <span className="flex items-center"><Shield className="w-4 h-4 mr-1" />Decentralized</span>
          <span className="flex items-center"><Globe className="w-4 h-4 mr-1" />Global CDN</span>
          <span className="flex items-center"><Zap className="w-4 h-4 mr-1" />No Monthly Fees</span>
        </div>
      </div>

      {/* Payment Method Info */}
      <Card className="bg-gradient-to-r from-green-50 to-blue-50">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CreditCard className="w-5 h-5 text-green-600" />
              <span className="font-medium">Payment Method:</span>
              <span className="text-xl font-bold text-green-600">USDC Only</span>
            </div>
            <Badge variant="outline" className="text-blue-600 border-blue-600">
              Dynamic Pricing
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} defaultValue="packages" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="packages">Browse Packages</TabsTrigger>
          <TabsTrigger value="dashboard">Storage Dashboard</TabsTrigger>
          <TabsTrigger value="custom">Custom Amount</TabsTrigger>
        </TabsList>

        {/* Payment Dialog */}
        <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Complete Purchase</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {currentPurchase && (
                <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                  <div className="flex justify-between">
                    <span>Storage:</span>
                    <span className="font-medium">{currentPurchase.storageGB} GB</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Price:</span>
                    <span className="font-medium text-green-600">${currentPurchase.priceUSDC} USDC</span>
                  </div>
                </div>
              )}
              
              {paymentStatus === 'idle' && (
                <Checkout
                  chargeHandler={chargeHandler}
                  onStatus={(status) => {
                    if (status.statusName === 'success') {
                      handlePaymentSuccess();
                    } else if (status.statusName === 'error') {
                      setPaymentStatus('error');
                      setPaymentError(status.statusData?.error || 'Payment failed');
                    }
                  }}
                >
                  <CheckoutButton coinbaseBranded />
                </Checkout>
              )}
              
              {paymentStatus === 'processing' && (
                <div className="text-center py-4">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                  <p>Processing payment...</p>
                </div>
              )}
              
              {paymentStatus === 'pending' && (
                <div className="text-center py-4">
                  <CheckCircle className="w-8 h-8 text-yellow-600 mx-auto mb-2" />
                  <p>Payment pending confirmation...</p>
                </div>
              )}
              
              {paymentStatus === 'error' && (
                <div className="text-center py-4">
                  <AlertCircle className="w-8 h-8 text-red-600 mx-auto mb-2" />
                  <p className="text-red-600">{paymentError}</p>
                  <Button 
                    onClick={() => {
                      setPaymentStatus('idle');
                      setPaymentError(null);
                    }}
                    className="mt-2"
                  >
                    Try Again
                  </Button>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Browse Packages - Quick Purchase Options */}
        <TabsContent value="packages" className="space-y-6">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold mb-2">Choose Your Storage Plan</h2>
            <p className="text-gray-600">Select from our popular storage options or customize your own amount</p>
          </div>
          
          {/* Quick Purchase Options */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* 100 MB Option */}
            <Card className="relative hover:shadow-lg transition-shadow">
              <CardHeader className="text-center">
                <CardTitle className="text-xl">100 MB</CardTitle>
                <p className="text-sm text-gray-600">Basic Storage</p>
              </CardHeader>
              <CardContent className="text-center space-y-4">
                <div className="text-2xl font-bold text-blue-600">$0.50</div>
                <p className="text-sm text-gray-500">Perfect for documents</p>
                <Button 
                  className="w-full" 
                  onClick={() => handlePurchase(null, 100)}
                  disabled={purchasing === 100}
                >
                  {purchasing === 100 ? (
                    <div className="flex items-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Processing...
                    </div>
                  ) : (
                    <>Buy Now</>
                  )}
                </Button>
              </CardContent>
            </Card>
            
            {/* 500 MB Option */}
            <Card className="relative hover:shadow-lg transition-shadow border-blue-500 border-2">
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                <Badge className="bg-blue-500 text-white">Popular Choice</Badge>
              </div>
              <CardHeader className="text-center pt-6">
                <CardTitle className="text-xl text-blue-600">500 MB</CardTitle>
                <p className="text-sm text-gray-600">Recommended</p>
              </CardHeader>
              <CardContent className="text-center space-y-4">
                <div className="text-2xl font-bold text-blue-600">$2.50</div>
                <p className="text-sm text-gray-500">Great for photos & files</p>
                <Button 
                  className="w-full bg-blue-500 hover:bg-blue-600" 
                  onClick={() => handlePurchase(null, 500)}
                  disabled={purchasing === 500}
                >
                  {purchasing === 500 ? (
                    <div className="flex items-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Processing...
                    </div>
                  ) : (
                    <>Buy Now</>
                  )}
                </Button>
              </CardContent>
            </Card>
            
            {/* 1 GB Option */}
            <Card className="relative hover:shadow-lg transition-shadow">
              <CardHeader className="text-center">
                <CardTitle className="text-xl">1 GB</CardTitle>
                <p className="text-sm text-gray-600">Power User</p>
              </CardHeader>
              <CardContent className="text-center space-y-4">
                <div className="text-2xl font-bold text-blue-600">$5.00</div>
                <p className="text-sm text-gray-500">For heavy usage</p>
                <Button 
                  className="w-full" 
                  onClick={() => handlePurchase(null, 1024)}
                  disabled={purchasing === 1024}
                >
                  {purchasing === 1024 ? (
                    <div className="flex items-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Processing...
                    </div>
                  ) : (
                    <>Buy Now</>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
          
          {/* Alternative Options */}
          <div className="flex justify-center space-x-4 pt-6">
            <Button 
               variant="outline" 
               onClick={() => setActiveTab('custom')}
               className="flex items-center"
             >
               <Calculator className="w-4 h-4 mr-2" />
               Custom Amount
             </Button>
          </div>
        </TabsContent>

        {/* User Storage Dashboard */}
        <TabsContent value="dashboard" className="space-y-6">
          {userStorage ? (
            <>
              {/* Storage Overview */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-600">Total Storage</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{userStorage.storage_summary.total_credits_gb} GB</div>
                    <p className="text-xs text-gray-500">{userStorage.storage_summary.total_credits_mb.toLocaleString()} MB</p>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-600">Used Storage</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{userStorage.storage_summary.used_credits_gb} GB</div>
                    <p className="text-xs text-gray-500">{userStorage.storage_summary.used_credits_mb.toLocaleString()} MB</p>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-600">Available Storage</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-bold ${getUsageColor(userStorage.storage_summary.usage_percentage)}`}>
                      {userStorage.storage_summary.available_credits_gb} GB
                    </div>
                    <p className="text-xs text-gray-500">{userStorage.storage_summary.available_credits_mb.toLocaleString()} MB</p>
                  </CardContent>
                </Card>
              </div>

              {/* Usage Progress */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Storage Usage</span>
                    <span className={`text-sm ${getUsageColor(userStorage.storage_summary.usage_percentage)}`}>
                      {userStorage.storage_summary.usage_percentage.toFixed(1)}% used
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Progress 
                    value={userStorage.storage_summary.usage_percentage} 
                    className="h-3"
                  />
                  {userStorage.usage_statistics.estimated_days_remaining && (
                    <p className="text-sm text-gray-600 mt-2 flex items-center">
                      <Clock className="w-4 h-4 mr-1" />
                      Estimated {userStorage.usage_statistics.estimated_days_remaining} days remaining at current usage rate
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Statistics */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-2">
                      <Upload className="w-5 h-5 text-blue-600" />
                      <div>
                        <div className="text-lg font-semibold">{userStorage.usage_statistics.total_uploads}</div>
                        <div className="text-xs text-gray-500">Total Uploads</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-2">
                      <CreditCard className="w-5 h-5 text-green-600" />
                      <div>
                        <div className="text-lg font-semibold">${userStorage.financial_summary.total_spent_usd}</div>
                        <div className="text-xs text-gray-500">Total Spent</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-2">
                      <TrendingUp className="w-5 h-5 text-purple-600" />
                      <div>
                        <div className="text-lg font-semibold">${userStorage.financial_summary.cost_per_gb_usd}</div>
                        <div className="text-xs text-gray-500">Cost per GB</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-2">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      <div>
                        <div className="text-lg font-semibold">{userStorage.financial_summary.completed_purchases}</div>
                        <div className="text-xs text-gray-500">Purchases</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Recent Activity */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Recent Purchases</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {userStorage.recent_purchases.slice(0, 5).map((purchase) => (
                        <div key={purchase.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div>
                            <div className="font-medium">{purchase.package_name}</div>
                            <div className="text-sm text-gray-600">{purchase.storage_gb} GB</div>
                            <div className="text-xs text-gray-500">
                              {new Date(purchase.purchased_at).toLocaleDateString()}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold text-green-600">${purchase.price_paid_usdc || purchase.price_paid_usd} USDC</div>
                            <Badge 
                              variant={purchase.status === 'completed' ? 'default' : 'secondary'}
                              className="text-xs"
                            >
                              {purchase.status}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle>Recent Uploads</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {userStorage.recent_usage.slice(0, 5).map((usage, index) => (
                        <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div>
                            <div className="font-medium text-sm font-mono">{usage.file_id.substring(0, 12)}...</div>
                            <div className="text-sm text-gray-600">{usage.file_size_mb} MB</div>
                            <div className="text-xs text-gray-500">
                              {new Date(usage.upload_timestamp).toLocaleDateString()}
                            </div>
                          </div>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => window.open(usage.arweave_url, '_blank')}
                          >
                            <Download className="w-3 h-3 mr-1" />
                            View
                          </Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Recommendations */}
              {userStorage.recommendations.should_purchase_more && (
                <Card className="border-yellow-200 bg-yellow-50">
                  <CardContent className="p-4">
                    <div className="flex items-start space-x-3">
                      <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
                      <div>
                        <h3 className="font-medium text-yellow-800">Low Storage Warning</h3>
                        <p className="text-sm text-yellow-700 mt-1">
                          You have less than 100MB of storage remaining. Consider purchasing more storage to continue uploading files.
                        </p>
                        <Button size="sm" className="mt-2" onClick={() => setActiveTab('packages')}>
                          Browse Packages
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <Database className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Storage Credits</h3>
                <p className="text-gray-600 mb-4">You haven't purchased any storage credits yet. Get started by choosing a package.</p>
                <Button onClick={() => setActiveTab('packages')}>
                  Browse Storage Packages
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Custom Purchase */}
        <TabsContent value="custom" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Custom Storage Purchase</CardTitle>
              <p className="text-sm text-gray-600">Purchase exactly the amount of storage you need</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Storage Amount (MB)
                </label>
                <input
                  type="number"
                  value={customStorage}
                  onChange={(e) => handleCustomStorageChange(e.target.value)}
                  placeholder="Enter storage amount in MB"
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  min="1"
                />
                {customStorage && (
                  <p className="text-sm text-gray-600 mt-1">
                    = {(customStorage / 1024).toFixed(2)} GB
                  </p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Payment Method
                </label>
                <div className="flex items-center p-3 bg-green-50 border border-green-200 rounded-lg">
                  <CreditCard className="w-5 h-5 text-green-600 mr-2" />
                  <span className="font-medium text-green-800">USDC Only</span>
                  <Badge variant="outline" className="ml-auto text-blue-600 border-blue-600">
                    Dynamic Rate
                  </Badge>
                </div>
              </div>

              {(customStorage || calculatedPrice) && (
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-medium mb-2">Price Calculation</h4>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>Storage Amount:</span>
                      <span>{customStorage} MB ({(customStorage / 1024).toFixed(2)} GB)</span>
                    </div>
                    {calculating ? (
                      <div className="flex justify-center py-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                        <span className="ml-2 text-sm">Calculating price...</span>
                      </div>
                    ) : calculatedPrice ? (
                      <>
                        <div className="flex justify-between">
                          <span>Rate:</span>
                          <span>~${(calculatedPrice.priceUSDC / calculatedPrice.storageGB).toFixed(2)}/GB</span>
                        </div>
                        <div className="flex justify-between font-medium border-t pt-1">
                          <span>Total Cost:</span>
                          <span className="text-green-600">${calculatedPrice.priceUSDC} USDC</span>
                        </div>
                        <div className="text-xs text-gray-500 mt-2">
                          * Real-time pricing based on Arweave network costs
                        </div>
                      </>
                    ) : (
                      <div className="text-sm text-gray-500">Enter amount to see pricing</div>
                    )}
                  </div>
                </div>
              )}

              <Button 
                className="w-full" 
                onClick={() => handlePurchase(null, parseInt(customStorage))}
                disabled={!customStorage || customStorage < 1 || purchasing === 'custom' || !calculatedPrice}
              >
                {purchasing === 'custom' ? (
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Processing...
                  </div>
                ) : (
                  <div className="flex items-center">
                    <ShoppingCart className="w-4 h-4 mr-2" />
                    Purchase {customStorage ? (customStorage / 1024).toFixed(2) : '0'} GB
                    {calculatedPrice && ` - $${calculatedPrice.priceUSDC} USDC`}
                  </div>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Information Card */}
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="p-4">
              <div className="flex items-start space-x-3">
                <Info className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <h3 className="font-medium text-blue-800">How USDC Pricing Works</h3>
                  <ul className="text-sm text-blue-700 mt-1 space-y-1">
                    <li>• Dynamic pricing based on Arweave network costs</li>
                    <li>• Real-time market rates for optimal efficiency</li>
                    <li>• Minimum purchase: 1 MB</li>
                    <li>• Storage credits never expire</li>
                    <li>• Pay once, store forever on Arweave</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default StorageMarketplace;