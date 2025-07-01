import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { Input } from './ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { 
  Database, 
  ShoppingCart, 
  Users, 
  TrendingUp, 
  CheckCircle, 
  AlertTriangle, 
  RefreshCw, 
  Zap, 
  Shield, 
  Globe,
  ArrowUpRight,
  Calculator,
  CreditCard,
  Upload,
  AlertCircle,
  Clock
} from 'lucide-react';
import { toast } from 'sonner';
import { Checkout, CheckoutButton, CheckoutStatus } from '@coinbase/onchainkit/checkout';
import { useAccount } from 'wagmi';
import P2PStorageMarketplace from './P2PStorageMarketplace';
import '../styles/dashboard.css';

const StorageDashboard = ({ userId, walletAddress, onOpenMarketplace }) => {
  const { address, isConnected } = useAccount();
  const [storageData, setStorageData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showP2PMarketplace, setShowP2PMarketplace] = useState(false);
  const [customStorage, setCustomStorage] = useState('');
  const [calculatedPrice, setCalculatedPrice] = useState(null);
  const [calculating, setCalculating] = useState(false);
  
  // Payment states
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState('idle');
  const [paymentError, setPaymentError] = useState(null);
  const [chargeId, setChargeId] = useState(null);
  const [currentPurchase, setCurrentPurchase] = useState(null);

  useEffect(() => {
    if (userId && walletAddress) {
      fetchStorageData();
    }
  }, [userId, walletAddress]);

  // Monitor payment status
  useEffect(() => {
    if (!chargeId || paymentStatus !== 'pending') return;

    const checkPaymentStatus = async () => {
      try {
        const response = await fetch(`/api/chargeStatus?chargeId=${chargeId}`);
        if (!response.ok) return;
        
        const data = await response.json();
        if (data.status === 'COMPLETED') {
          setPaymentStatus('success');
          await handlePaymentSuccess();
        } else if (data.status === 'FAILED' || data.status === 'EXPIRED') {
          setPaymentStatus('error');
          setPaymentError('Payment failed or expired');
        }
      } catch (error) {
        console.error('Error checking payment status:', error);
      }
    };

    const interval = setInterval(checkPaymentStatus, 3000);
    return () => clearInterval(interval);
  }, [chargeId, paymentStatus]);

  const chargeHandler = useCallback(async () => {
    if (!isConnected || !address) {
      toast.error('Please connect your wallet first');
      return;
    }

    if (!currentPurchase) {
      toast.error('No purchase data available');
      return;
    }

    setPaymentStatus('processing');
    setPaymentError(null);

    try {
      const requestBody = {
        amount: currentPurchase.price.toString(),
        currency: 'USDC',
        metadata: {
          userId,
          walletAddress: address,
          storageMB: currentPurchase.storageMB,
          purchaseType: 'storage'
        }
      };

      const response = await fetch('/api/createCharge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create payment');
      }

      const data = await response.json();
      if (data.success && data.chargeId) {
        setChargeId(data.chargeId);
        setPaymentStatus('pending');
        return data.chargeId;
      } else {
        throw new Error('Invalid response format from payment service');
      }
      
    } catch (error) {
      console.error('Payment error:', error);
      const errorMessage = error.message || 'Failed to process payment';
      setPaymentStatus('error');
      setPaymentError(errorMessage);
      throw new Error(errorMessage);
    }
  }, [address, currentPurchase, userId, isConnected]);

  const fetchStorageData = async (showRefreshing = false) => {
    try {
      if (showRefreshing) setRefreshing(true);
      else setLoading(true);
      
      const response = await fetch(`/api/getUserStorage?userId=${userId}&walletAddress=${walletAddress}`);
      const data = await response.json();
      
      if (data.success) {
        setStorageData(data);
      } else {
        console.error('Failed to fetch storage data:', data.error);
      }
    } catch (error) {
      console.error('Error fetching storage data:', error);
      toast.error('Failed to load storage information');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const getUsageColor = (percentage) => {
    if (percentage >= 90) return 'text-red-600';
    if (percentage >= 70) return 'text-yellow-600';
    return 'text-green-600';
  };

  const getUsageBarColor = (percentage) => {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 70) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const formatBytes = (mb) => {
    if (mb >= 1024) {
      return `${(mb / 1024).toFixed(1)} GB`;
    }
    return `${mb} MB`;
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            <span className="ml-2 text-sm text-gray-600">Loading storage info...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

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
          dryRun: true // Add this flag to just calculate price without creating purchase
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




  const handlePaymentSuccess = async () => {
    if (!chargeId || !currentPurchase) {
      toast.error('Missing payment or purchase information');
      return;
    }

    try {
      const response = await fetch('/api/purchaseStorage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          walletAddress: address,
          paymentMethod: 'crypto',
          chargeId,
          customStorageMB: currentPurchase.storageMB
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to finalize storage purchase');
      }

      const data = await response.json();
      toast.success(`Successfully purchased ${currentPurchase.storageMB} MB of storage!`);
      
      // Reset states
      setShowPaymentDialog(false);
      setPaymentStatus('idle');
      setChargeId(null);
      setCurrentPurchase(null);
      setCustomStorage('');
      setCalculatedPrice(null);
      
      // Refresh storage data
      fetchStorageData();
    } catch (error) {
      console.error('Error finalizing purchase:', error);
      toast.error('Failed to finalize storage purchase');
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



  const handleCustomPurchase = async () => {
    const storageMB = parseInt(customStorage);
    if (!storageMB || storageMB <= 0) {
      toast.error('Please enter a valid storage amount');
      return;
    }

    if (!isConnected || !address) {
      toast.error('Please connect your wallet first');
      return;
    }

    try {
      // First calculate the price with dryRun
      const response = await fetch('/api/purchaseStorage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          walletAddress: address,
          customStorageMB: storageMB,
          dryRun: true
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to calculate price');
      }

      const data = await response.json();
      
      // Set current purchase data
      setCurrentPurchase({
        storageMB: storageMB,
        price: data.price || data.price_usdc
      });
      
      // Show payment dialog
      setShowPaymentDialog(true);
    } catch (error) {
      console.error('Error preparing purchase:', error);
      toast.error('Failed to prepare purchase');
    }
  };

  const handleQuickPurchase = async (storageMB) => {
    if (!storageMB || storageMB <= 0) {
      toast.error('Invalid storage amount');
      return;
    }

    if (!isConnected || !address) {
      toast.error('Please connect your wallet first');
      return;
    }

    try {
      // First calculate the price with dryRun
      const response = await fetch('/api/purchaseStorage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          walletAddress: address,
          customStorageMB: storageMB,
          dryRun: true
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to calculate price');
      }

      const data = await response.json();
      
      // Set current purchase data
      setCurrentPurchase({
        storageMB: storageMB,
        price: data.price || data.price_usdc
      });
      
      // Show payment dialog
      setShowPaymentDialog(true);
    } catch (error) {
      console.error('Error preparing purchase:', error);
      toast.error('Failed to prepare purchase');
    }
  };

  if (!storageData || !storageData.storage_summary) {
    return (
      <div className="space-y-4">
        <Card className="border-dashed border-2 border-gray-300 hover:border-blue-400 transition-colors duration-300">
          <CardContent className="p-8">
            <div className="text-center mb-8">
              <div className="relative">
                <Database className="w-16 h-16 text-gray-400 mx-auto mb-4 animate-pulse" />
                <div className="absolute -top-1 -right-1 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                  <Zap className="w-3 h-3 text-white" />
                </div>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Purchase Storage Credits</h3>
              <p className="text-sm text-gray-600 mb-6 max-w-md mx-auto">
                Enter the amount of storage you need or choose from our preset options below.
              </p>
            </div>

            {/* Custom Storage Input */}
            <div className="max-w-md mx-auto mb-8">
              <div className="space-y-4">
                <div className="relative">
                  <Input
                    type="number"
                    placeholder="Enter storage amount (MB)"
                    value={customStorage}
                    onChange={(e) => handleCustomStorageChange(e.target.value)}
                    className="pr-16 text-center text-lg font-medium"
                    min="1"
                  />
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-sm text-gray-500">
                    MB
                  </div>
                </div>
                
                {calculating && (
                  <div className="flex items-center justify-center text-sm text-blue-600">
                    <Calculator className="w-4 h-4 mr-2 animate-spin" />
                    Calculating price...
                  </div>
                )}
                
                {calculatedPrice && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
                    <div className="text-lg font-bold text-blue-700">
                      ${calculatedPrice.priceUSDC} USDC
                    </div>
                    <div className="text-sm text-blue-600">
                      for {calculatedPrice.storageGB} GB ({calculatedPrice.storageMB} MB)
                    </div>
                  </div>
                )}
                
                {customStorage && calculatedPrice && (
                  <Button
                    onClick={handleCustomPurchase}
                    disabled={!isConnected}
                    className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800"
                    size="lg"
                  >
                    <CreditCard className="w-4 h-4 mr-2" />
                    {!isConnected ? 'Connect Wallet' : `Purchase ${calculatedPrice.storageGB} GB for $${calculatedPrice.priceUSDC}`}
                  </Button>
                )}
              </div>
            </div>



            {/* Preset Options */}
            <div className="space-y-4">
              <div className="text-center">
                <h4 className="text-lg font-semibold text-gray-800 mb-4">Quick Purchase Options</h4>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* 100MB Preset */}
                <Card className="border-2 border-gray-200 hover:border-blue-400 transition-all duration-300 cursor-pointer group">
                  <CardContent className="p-4 text-center">
                    <div className="text-2xl font-bold text-gray-700 mb-1">100 MB</div>
                    <div className="text-sm text-gray-500 mb-3">Basic Storage</div>
                    <Button
                      onClick={() => handleQuickPurchase(100)}
                      disabled={!isConnected}
                      variant="outline"
                      className="w-full group-hover:bg-blue-50 group-hover:border-blue-400"
                    >
                      <ShoppingCart className="w-4 h-4 mr-2" />
                      {!isConnected ? 'Connect Wallet' : 'Buy Now'}
                    </Button>
                  </CardContent>
                </Card>

                {/* 500MB Preset */}
                <Card className="border-2 border-blue-200 hover:border-blue-400 transition-all duration-300 cursor-pointer group bg-blue-50">
                  <CardContent className="p-4 text-center">
                    <div className="text-2xl font-bold text-blue-700 mb-1">500 MB</div>
                    <div className="text-sm text-blue-600 mb-1">Popular Choice</div>
                    <Badge className="mb-3 bg-blue-100 text-blue-700">Recommended</Badge>
                    <Button
                      onClick={() => handleQuickPurchase(500)}
                      disabled={!isConnected}
                      className="w-full bg-blue-600 hover:bg-blue-700"
                    >
                      <ShoppingCart className="w-4 h-4 mr-2" />
                      {!isConnected ? 'Connect Wallet' : 'Buy Now'}
                    </Button>
                  </CardContent>
                </Card>

                {/* 1GB Preset */}
                <Card className="border-2 border-gray-200 hover:border-blue-400 transition-all duration-300 cursor-pointer group">
                  <CardContent className="p-4 text-center">
                    <div className="text-2xl font-bold text-gray-700 mb-1">1 GB</div>
                    <div className="text-sm text-gray-500 mb-3">Power User</div>
                    <Button
                      onClick={() => handleQuickPurchase(1024)}
                      disabled={!isConnected}
                      variant="outline"
                      className="w-full group-hover:bg-blue-50 group-hover:border-blue-400"
                    >
                      <ShoppingCart className="w-4 h-4 mr-2" />
                      {!isConnected ? 'Connect Wallet' : 'Buy Now'}
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Alternative Options */}
            <div className="mt-8 pt-6 border-t border-gray-200">
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button 
                  onClick={onOpenMarketplace} 
                  variant="outline"
                  className="flex items-center justify-center hover:bg-blue-50 hover:border-blue-500 transition-all duration-300"
                  size="lg"
                >
                  <ShoppingCart className="w-4 h-4 mr-2" />
                  Browse All Packages
                  <ArrowUpRight className="w-4 h-4 ml-1" />
                </Button>
                
                <Button 
                  onClick={() => setShowP2PMarketplace(true)} 
                  variant="outline"
                  className="flex items-center justify-center hover:bg-green-50 hover:border-green-500 transition-all duration-300"
                  size="lg"
                >
                  <Users className="w-4 h-4 mr-2 text-green-600" />
                  P2P Marketplace
                  <Globe className="w-4 h-4 ml-1 text-green-600" />
                </Button>
              </div>
              
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-gray-500">
                <div className="flex items-center justify-center space-x-1">
                  <Shield className="w-3 h-3" />
                  <span>Secure & Decentralized</span>
                </div>
                <div className="flex items-center justify-center space-x-1">
                  <TrendingUp className="w-3 h-3" />
                  <span>Dynamic Pricing</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Payment Dialog */}
        <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center">
                <CreditCard className="w-5 h-5 mr-2" />
                Complete Payment
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {currentPurchase && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="text-center">
                    <div className="text-lg font-bold text-blue-700">
                      ${currentPurchase.price} USDC
                    </div>
                    <div className="text-sm text-blue-600">
                      for {(currentPurchase.storageMB / 1024).toFixed(1)} GB ({currentPurchase.storageMB} MB)
                    </div>
                  </div>
                </div>
              )}
              
              {paymentStatus === 'error' && paymentError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-center">
                    <AlertCircle className="w-4 h-4 text-red-600 mr-2" />
                    <span className="text-sm text-red-700">{paymentError}</span>
                  </div>
                </div>
              )}
              
              <div className="space-y-2">
                {chargeId ? (
                  <Checkout chargeId={chargeId}>
                    <CheckoutButton
                      coinbaseBranded
                      text="Pay with Crypto"
                    />
                    <CheckoutStatus
                      onSuccess={handlePaymentSuccess}
                      onError={(error) => {
                        console.error('Checkout error:', error);
                        setPaymentError(error.message || 'Payment failed');
                        setPaymentStatus('error');
                      }}
                    />
                  </Checkout>
                ) : (
                  <Button
                    onClick={chargeHandler}
                    disabled={paymentStatus === 'processing'}
                    className="w-full"
                  >
                    {paymentStatus === 'processing' ? (
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <CreditCard className="w-4 h-4 mr-2" />
                    )}
                    {paymentStatus === 'processing' ? 'Preparing Payment...' : 'Initialize Payment'}
                  </Button>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
        
        {/* P2P Storage Marketplace Modal */}
        {showP2PMarketplace && (
          <P2PStorageMarketplace
            userId={userId}
            walletAddress={walletAddress}
            onClose={() => setShowP2PMarketplace(false)}
          />
        )}
      </div>
    );
  }

  const { storage_summary, usage_statistics, financial_summary, recommendations } = storageData;
  const usagePercentage = storage_summary.usage_percentage;
  const isLowStorage = storage_summary.available_credits_mb < 100;

  return (
    <div className="space-y-6">
      {/* Main Storage Card */}
      <Card className={`transition-all duration-300 ${isLowStorage ? 'border-yellow-400 bg-gradient-to-br from-yellow-50 to-orange-50 shadow-lg' : 'hover:shadow-lg border-gray-200'}`}>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center text-xl font-semibold">
              <div className="relative">
                <Database className="w-6 h-6 mr-3 text-blue-600" />
                {isLowStorage && (
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-500 rounded-full animate-pulse"></div>
                )}
              </div>
              Storage Dashboard
            </CardTitle>
            <div className="flex items-center space-x-2">
              {refreshing && (
                <RefreshCw className="animate-spin h-4 w-4 text-blue-600" />
              )}
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setShowP2PMarketplace(true)}
                className="rounded-full w-10 h-10 p-0 hover:bg-green-100 transition-all duration-200 transform hover:scale-110"
                title="P2P Storage Marketplace"
              >
                <Users className="w-4 h-4 text-green-600" />
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => fetchStorageData(true)}
                disabled={refreshing}
                className="hover:bg-blue-50 transition-all duration-200"
              >
                <RefreshCw className={`w-4 h-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Storage Overview */}
          <div className="grid grid-cols-3 gap-6">
            <div className="text-center p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl border border-blue-200 transition-all duration-300 hover:shadow-md">
              <div className="text-3xl font-bold text-blue-700 mb-1">
                {storage_summary.total_credits_gb}
              </div>
              <div className="text-sm font-medium text-blue-600">Total Storage</div>
              <div className="text-xs text-blue-500 mt-1">GB Available</div>
            </div>
            <div className="text-center p-4 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border border-gray-200 transition-all duration-300 hover:shadow-md">
              <div className="text-3xl font-bold text-gray-700 mb-1">
                {storage_summary.used_credits_gb}
              </div>
              <div className="text-sm font-medium text-gray-600">Used Storage</div>
              <div className="text-xs text-gray-500 mt-1">GB Consumed</div>
            </div>
            <div className="text-center p-4 bg-gradient-to-br from-green-50 to-emerald-100 rounded-xl border border-green-200 transition-all duration-300 hover:shadow-md">
              <div className={`text-3xl font-bold mb-1 ${getUsageColor(usagePercentage)}`}>
                {storage_summary.available_credits_gb}
              </div>
              <div className="text-sm font-medium text-green-600">Available</div>
              <div className="text-xs text-green-500 mt-1">GB Remaining</div>
            </div>
          </div>

          {/* Usage Progress Bar */}
          <div className="space-y-3 p-4 bg-gradient-to-r from-gray-50 to-blue-50 rounded-xl border border-gray-200">
            <div className="flex justify-between items-center">
              <span className="text-base font-semibold text-gray-800 flex items-center">
                <TrendingUp className="w-4 h-4 mr-2 text-blue-600" />
                Storage Usage
              </span>
              <div className="flex items-center space-x-2">
                <span className={`text-lg font-bold ${getUsageColor(usagePercentage)}`}>
                  {usagePercentage.toFixed(1)}%
                </span>
                <Badge 
                  variant="outline" 
                  className={`
                    ${usagePercentage >= 90 ? 'border-red-500 text-red-700 bg-red-50' : ''}
                    ${usagePercentage >= 70 && usagePercentage < 90 ? 'border-yellow-500 text-yellow-700 bg-yellow-50' : ''}
                    ${usagePercentage < 70 ? 'border-green-500 text-green-700 bg-green-50' : ''}
                  `}
                >
                  {usagePercentage >= 90 ? 'Critical' : usagePercentage >= 70 ? 'High' : 'Good'}
                </Badge>
              </div>
            </div>
            <div className="relative">
              <div className="w-full bg-gray-300 rounded-full h-3 shadow-inner">
                <div 
                  className={`h-3 rounded-full transition-all duration-500 ease-out ${getUsageBarColor(usagePercentage)} shadow-sm`}
                  style={{ width: `${Math.min(usagePercentage, 100)}%` }}
                ></div>
              </div>
              {usagePercentage > 0 && (
                <div 
                  className="absolute top-0 h-3 w-1 bg-white rounded-full shadow-md transition-all duration-500"
                  style={{ left: `${Math.min(usagePercentage, 100)}%`, transform: 'translateX(-50%)' }}
                ></div>
              )}
            </div>
            <div className="flex justify-between text-sm text-gray-600">
              <span className="font-medium">
                {storage_summary.used_credits_mb.toLocaleString()} MB used
              </span>
              <span>
                {storage_summary.total_credits_mb.toLocaleString()} MB total
              </span>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200">
            <div className="flex items-center space-x-3 p-3 bg-blue-50 rounded-lg border border-blue-200 transition-all duration-300 hover:shadow-md">
              <div className="p-2 bg-blue-100 rounded-full">
                <Upload className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <div className="text-lg font-bold text-blue-700">{usage_statistics.total_uploads}</div>
                <div className="text-xs font-medium text-blue-600">Files Uploaded</div>
              </div>
            </div>
            <div className="flex items-center space-x-3 p-3 bg-green-50 rounded-lg border border-green-200 transition-all duration-300 hover:shadow-md">
              <div className="p-2 bg-green-100 rounded-full">
                <TrendingUp className="w-4 h-4 text-green-600" />
              </div>
              <div>
                <div className="text-lg font-bold text-green-700">${financial_summary.cost_per_gb_usd}</div>
                <div className="text-xs font-medium text-green-600">Cost per GB</div>
              </div>
            </div>
          </div>

          {/* Time Remaining */}
          {usage_statistics.estimated_days_remaining && (
            <div className="flex items-center space-x-3 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200 transition-all duration-300 hover:shadow-md">
              <div className="p-2 bg-blue-100 rounded-full">
                <Clock className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <div className="text-lg font-bold text-blue-800">
                  ~{usage_statistics.estimated_days_remaining} days remaining
                </div>
                <div className="text-sm text-blue-600 font-medium">at current usage rate</div>
              </div>
              <Badge variant="outline" className="border-blue-500 text-blue-700 bg-blue-50">
                Estimate
              </Badge>
            </div>
          )}

          {/* Low Storage Warning */}
          {isLowStorage && (
            <div className="flex items-start space-x-3 p-4 bg-gradient-to-r from-yellow-50 to-orange-50 rounded-xl border border-yellow-300 shadow-md animate-pulse-slow">
              <div className="p-2 bg-yellow-100 rounded-full">
                <AlertTriangle className="w-5 h-5 text-yellow-600" />
              </div>
              <div className="flex-1">
                <div className="text-lg font-bold text-yellow-800">Low Storage Warning</div>
                <div className="text-sm text-yellow-700 mt-1">
                  You have less than 100MB remaining. Purchase more storage to continue uploading your files to the decentralized network.
                </div>
                <Button 
                  onClick={onOpenMarketplace} 
                  className="mt-3 bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700 text-white shadow-md transition-all duration-300 transform hover:scale-105"
                  size="sm"
                >
                  <ShoppingCart className="w-4 h-4 mr-2" />
                  Buy More Storage Now
                </Button>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <Button 
              onClick={onOpenMarketplace} 
              className={`flex-1 flex items-center justify-center transition-all duration-300 transform hover:scale-105 ${
                isLowStorage 
                  ? 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg' 
                  : 'hover:bg-blue-50 border-2 hover:border-blue-500'
              }`}
              variant={isLowStorage ? "default" : "outline"}
              size="lg"
            >
              <ShoppingCart className="w-4 h-4 mr-2" />
              {isLowStorage ? 'Buy More Storage' : 'Official Store'}
              <ArrowUpRight className="w-4 h-4 ml-1" />
            </Button>
            <Button 
              onClick={() => setShowP2PMarketplace(true)} 
              className="flex-1 flex items-center justify-center border-2 hover:bg-green-50 hover:border-green-500 transition-all duration-300 transform hover:scale-105"
              variant="outline"
              size="lg"
            >
              <Users className="w-4 h-4 mr-2 text-green-600" />
              P2P Marketplace
              <Globe className="w-4 h-4 ml-1 text-green-600" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Recent Activity Summary */}
      {storageData.recent_usage && storageData.recent_usage.length > 0 && (
        <Card className="hover:shadow-lg transition-all duration-300">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg font-semibold flex items-center">
              <CheckCircle className="w-5 h-5 mr-2 text-green-600" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {storageData.recent_usage.slice(0, 3).map((usage, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-gradient-to-r from-gray-50 to-blue-50 rounded-lg border border-gray-200 hover:shadow-md transition-all duration-300">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-green-100 rounded-full">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                    </div>
                    <div>
                      <div className="text-sm font-mono text-gray-700 font-medium">
                        {usage.file_id.substring(0, 8)}...{usage.file_id.substring(-4)}
                      </div>
                      <div className="text-xs text-gray-500">
                        {new Date(usage.upload_timestamp).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <Badge variant="outline" className="border-blue-500 text-blue-700 bg-blue-50">
                    {usage.file_size_mb} MB
                  </Badge>
                </div>
              ))}
              {storageData.recent_usage.length > 3 && (
                <div className="text-center pt-3">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={onOpenMarketplace}
                    className="hover:bg-blue-50 transition-all duration-200"
                  >
                    View All Activity
                    <ArrowUpRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Efficiency Badge */}
      {recommendations.efficiency_rating && (
        <div className="flex justify-center">
          <div className="flex items-center space-x-2 p-3 rounded-xl border transition-all duration-300 hover:shadow-md">
            <div className={`p-2 rounded-full ${
              recommendations.efficiency_rating === 'excellent' ? 'bg-green-100' :
              recommendations.efficiency_rating === 'good' ? 'bg-blue-100' : 'bg-yellow-100'
            }`}>
              <Shield className={`w-4 h-4 ${
                recommendations.efficiency_rating === 'excellent' ? 'text-green-600' :
                recommendations.efficiency_rating === 'good' ? 'text-blue-600' : 'text-yellow-600'
              }`} />
            </div>
            <Badge 
              variant="outline" 
              className={`text-sm font-medium ${
                recommendations.efficiency_rating === 'excellent' ? 'border-green-500 text-green-700 bg-green-50' :
                recommendations.efficiency_rating === 'good' ? 'border-blue-500 text-blue-700 bg-blue-50' :
                'border-yellow-500 text-yellow-700 bg-yellow-50'
              }`}
            >
              {recommendations.efficiency_rating.charAt(0).toUpperCase() + recommendations.efficiency_rating.slice(1)} Storage Efficiency
            </Badge>
          </div>
        </div>
      )}
      
      {/* P2P Storage Marketplace Modal */}
      {showP2PMarketplace && (
        <P2PStorageMarketplace
          userId={userId}
          walletAddress={walletAddress}
          onClose={() => setShowP2PMarketplace(false)}
        />
      )}
    </div>
  );
};

export default StorageDashboard;