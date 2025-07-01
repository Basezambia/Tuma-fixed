import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
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
  Info,
  Plus,
  Minus,
  DollarSign,
  Users,
  Star,
  Eye,
  X
} from 'lucide-react';
import { toast } from 'sonner';

const P2PStorageMarketplace = ({ userId, walletAddress, onClose }) => {
  const [activeTab, setActiveTab] = useState('buy');
  const [listings, setListings] = useState([]);
  const [userStorage, setUserStorage] = useState(null);
  const [myListings, setMyListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(null);
  
  // Sell storage states
  const [sellAmount, setSellAmount] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [sellDescription, setSellDescription] = useState('');
  const [receivingWallet, setReceivingWallet] = useState(walletAddress);
  
  // Buy storage states
  const [selectedListing, setSelectedListing] = useState(null);
  const [buyAmount, setBuyAmount] = useState('');
  
  // Payment states
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentCharges, setPaymentCharges] = useState(null);
  const [completedPayments, setCompletedPayments] = useState({ platform: false, seller: false });

  useEffect(() => {
    if (userId && walletAddress) {
      fetchMarketplaceData();
    }
  }, [userId, walletAddress]);

  const fetchMarketplaceData = async () => {
    try {
      setLoading(true);
      
      // Fetch user storage info
      const userResponse = await fetch(`/api/getUserStorage?userId=${userId}&walletAddress=${walletAddress}`);
      const userData = await userResponse.json();
      
      if (userData.success) {
        setUserStorage(userData);
      }
      
      // Fetch marketplace listings
      const listingsResponse = await fetch('/api/getP2PListings');
      const listingsData = await listingsResponse.json();
      
      if (listingsData.success) {
        setListings(listingsData.listings.filter(l => l.seller_wallet !== walletAddress));
        setMyListings(listingsData.listings.filter(l => l.seller_wallet === walletAddress));
      }
    } catch (error) {
      console.error('Error fetching marketplace data:', error);
      toast.error('Failed to load marketplace data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateListing = async () => {
    if (!sellAmount || !sellPrice || parseFloat(sellAmount) <= 0 || parseFloat(sellPrice) <= 0) {
      toast.error('Please enter valid amount and price');
      return;
    }

    if (!userStorage?.storage_summary?.available_credits_mb || 
        parseFloat(sellAmount) * 1024 > userStorage.storage_summary.available_credits_mb) {
      toast.error('Insufficient storage credits to sell');
      return;
    }

    try {
      setProcessing('create');
      
      const response = await fetch('/api/createP2PListing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          sellerWallet: walletAddress,
          receivingWallet,
          storageAmountGB: parseFloat(sellAmount),
          pricePerGB: parseFloat(sellPrice),
          description: sellDescription || `${sellAmount}GB storage credits`,
          totalPrice: parseFloat(sellAmount) * parseFloat(sellPrice)
        })
      });

      const result = await response.json();
      
      if (result.success) {
        toast.success('Storage listing created successfully!');
        setSellAmount('');
        setSellPrice('');
        setSellDescription('');
        await fetchMarketplaceData();
      } else {
        toast.error(result.error || 'Failed to create listing');
      }
    } catch (error) {
      console.error('Error creating listing:', error);
      toast.error('Failed to create listing');
    } finally {
      setProcessing(null);
    }
  };

  const handlePurchaseListing = async (listing, amount = null) => {
    const purchaseAmount = amount || listing.storage_amount_gb;
    
    if (amount && amount > listing.storage_amount_gb) {
      toast.error('Cannot purchase more than available');
      return;
    }

    try {
      setProcessing(listing.id);
      
      // Step 1: Create payment charges
      const response = await fetch('/api/purchaseP2PListing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          listingId: listing.id,
          buyerUserId: userId,
          buyerWallet: walletAddress,
          purchaseAmountGB: purchaseAmount,
          totalPrice: purchaseAmount * listing.price_per_gb
        })
      });

      const result = await response.json();
      
      if (result.success && result.requiresPayment) {
        // Show payment modal with both charges
        setPaymentCharges({
          platformFee: result.payments.platformFee,
          sellerPayment: result.payments.sellerPayment,
          transaction: result.transaction
        });
        setShowPaymentModal(true);
        toast.info('Please complete both payments to finalize your purchase');
      } else if (result.success) {
        toast.success('Storage purchased successfully!');
        setSelectedListing(null);
        setBuyAmount('');
        await fetchMarketplaceData();
      } else {
        toast.error(result.error || 'Failed to purchase storage');
      }
    } catch (error) {
      console.error('Error purchasing storage:', error);
      toast.error('Failed to purchase storage');
    } finally {
      setProcessing(null);
    }
  };

  const handlePaymentComplete = async (platformChargeId, sellerChargeId) => {
    try {
      setProcessing('confirming');
      
      // Step 2: Confirm purchase after payments
      const response = await fetch('/api/confirmP2PPurchase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          listingId: paymentCharges.transaction.listing_id,
          buyerUserId: paymentCharges.transaction.buyer_user_id,
          buyerWallet: paymentCharges.transaction.buyer_wallet,
          purchaseAmountGB: paymentCharges.transaction.storage_amount_gb,
          totalPrice: paymentCharges.transaction.total_price,
          platformFee: paymentCharges.transaction.platform_fee,
          sellerPayment: paymentCharges.transaction.seller_payment,
          platformChargeId,
          sellerChargeId
        })
      });

      const result = await response.json();
      
      if (result.success) {
        toast.success('Storage purchased successfully! Credits have been added to your account.');
        setShowPaymentModal(false);
        setPaymentCharges(null);
        setSelectedListing(null);
        setBuyAmount('');
        await fetchMarketplaceData();
      } else {
        toast.error(result.error || 'Failed to confirm purchase');
      }
    } catch (error) {
      console.error('Error confirming purchase:', error);
      toast.error('Failed to confirm purchase');
    } finally {
      setProcessing(null);
    }
  };

  const handleCancelListing = async (listingId) => {
    try {
      setProcessing(listingId);
      
      const response = await fetch('/api/cancelP2PListing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          listingId,
          userId,
          walletAddress
        })
      });

      const result = await response.json();
      
      if (result.success) {
        toast.success('Listing cancelled successfully!');
        await fetchMarketplaceData();
      } else {
        toast.error(result.error || 'Failed to cancel listing');
      }
    } catch (error) {
      console.error('Error cancelling listing:', error);
      toast.error('Failed to cancel listing');
    } finally {
      setProcessing(null);
    }
  };

  const formatBytes = (mb) => {
    if (mb >= 1024) {
      return `${(mb / 1024).toFixed(1)} GB`;
    }
    return `${mb} MB`;
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <Card className="w-full max-w-4xl mx-4">
          <CardContent className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <span>Loading P2P marketplace...</span>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-6xl mx-4 max-h-[90vh] overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center space-x-2">
              <Users className="w-6 h-6" />
              <span>P2P Storage Marketplace</span>
            </CardTitle>
            <p className="text-sm text-gray-600 mt-1">
              Buy and sell storage credits directly with other users
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </CardHeader>
        
        <CardContent className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          {/* User Storage Summary */}
          {userStorage?.storage_summary && (
            <Card className="mb-6 bg-gradient-to-r from-blue-50 to-green-50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <Database className="w-8 h-8 text-blue-600" />
                    <div>
                      <h3 className="font-medium">Your Storage</h3>
                      <p className="text-sm text-gray-600">
                        Available: {formatBytes(userStorage.storage_summary.available_credits_mb)} | 
                        Used: {formatBytes(userStorage.storage_summary.used_credits_mb)}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-green-600 border-green-600">
                    {((userStorage.storage_summary.available_credits_mb / userStorage.storage_summary.total_credits_mb) * 100).toFixed(1)}% Available
                  </Badge>
                </div>
              </CardContent>
            </Card>
          )}

          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="buy">Buy Storage</TabsTrigger>
              <TabsTrigger 
                value="sell" 
                className={`relative ${
                  !userStorage?.storage_summary?.available_credits_mb || userStorage.storage_summary.available_credits_mb <= 0 
                    ? 'text-gray-400 data-[state=active]:text-gray-600' 
                    : ''
                }`}
              >
                Sell Storage
                {(!userStorage?.storage_summary?.available_credits_mb || userStorage.storage_summary.available_credits_mb <= 0) && (
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full flex items-center justify-center">
                    <AlertCircle className="w-2 h-2 text-white" />
                  </div>
                )}
              </TabsTrigger>
              <TabsTrigger value="mylistings">My Listings</TabsTrigger>
            </TabsList>

            {/* Buy Storage Tab */}
            <TabsContent value="buy" className="space-y-4">
              <div className="grid gap-4">
                {listings.length === 0 ? (
                  <Card>
                    <CardContent className="p-8 text-center">
                      <ShoppingCart className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">No Storage Available</h3>
                      <p className="text-gray-600">No users are currently selling storage credits.</p>
                    </CardContent>
                  </Card>
                ) : (
                  listings.map((listing) => (
                    <Card key={listing.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-2">
                              <h3 className="font-medium">{listing.description}</h3>
                              <Badge variant="outline">
                                {listing.storage_amount_gb} GB
                              </Badge>
                            </div>
                            <div className="flex items-center space-x-4 text-sm text-gray-600">
                              <span className="flex items-center">
                                <DollarSign className="w-3 h-3 mr-1" />
                                ${listing.price_per_gb}/GB
                              </span>
                              <span className="flex items-center">
                                <Wallet className="w-3 h-3 mr-1" />
                                {listing.seller_wallet.slice(0, 6)}...{listing.seller_wallet.slice(-4)}
                              </span>
                              <span className="flex items-center">
                                <Clock className="w-3 h-3 mr-1" />
                                {new Date(listing.created_at).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <div className="text-right mr-4">
                              <div className="font-bold text-lg">
                                ${(listing.storage_amount_gb * listing.price_per_gb).toFixed(2)}
                              </div>
                              <div className="text-xs text-gray-500">Total Price</div>
                            </div>
                            <Button
                              onClick={() => setSelectedListing(listing)}
                              disabled={processing === listing.id}
                              size="sm"
                            >
                              {processing === listing.id ? (
                                <div className="flex items-center">
                                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-1"></div>
                                  Processing...
                                </div>
                              ) : (
                                'Buy Now'
                              )}
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </TabsContent>

            {/* Sell Storage Tab */}
            <TabsContent value="sell" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Create Storage Listing</CardTitle>
                  <p className="text-sm text-gray-600">
                    Sell your unused storage credits to other users
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Check if user has storage credits */}
                  {!userStorage?.storage_summary?.available_credits_mb || userStorage.storage_summary.available_credits_mb <= 0 ? (
                    <div className="text-center py-8">
                      <div className="relative">
                        <Database className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                        <div className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center">
                          <AlertCircle className="w-3 h-3 text-white" />
                        </div>
                      </div>
                      <h3 className="text-xl font-semibold text-gray-900 mb-2">No Storage Credits Available</h3>
                      <p className="text-sm text-gray-600 mb-6 max-w-md mx-auto">
                        You need to purchase storage credits before you can create listings to sell to other users.
                      </p>
                      <div className="space-y-3">
                        <Button 
                          onClick={onClose}
                          className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800"
                          size="lg"
                        >
                          <ShoppingCart className="w-4 h-4 mr-2" />
                          Buy Storage Credits
                        </Button>
                        <p className="text-xs text-gray-500">
                          After purchasing storage, you can return here to create listings
                        </p>
                      </div>
                    </div>
                  ) : (
                  <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Storage Amount (GB)
                      </label>
                      <input
                        type="number"
                        value={sellAmount}
                        onChange={(e) => setSellAmount(e.target.value)}
                        placeholder="Enter GB amount"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        min="0.1"
                        step="0.1"
                        max={userStorage?.storage_summary?.available_credits_mb ? (userStorage.storage_summary.available_credits_mb / 1024).toFixed(1) : 0}
                      />
                      {userStorage?.storage_summary && (
                        <p className="text-xs text-gray-500 mt-1">
                          Available: {(userStorage.storage_summary.available_credits_mb / 1024).toFixed(1)} GB
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Price per GB (USDC)
                      </label>
                      <input
                        type="number"
                        value={sellPrice}
                        onChange={(e) => setSellPrice(e.target.value)}
                        placeholder="Enter price per GB"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        min="0.01"
                        step="0.01"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Description (Optional)
                    </label>
                    <input
                      type="text"
                      value={sellDescription}
                      onChange={(e) => setSellDescription(e.target.value)}
                      placeholder="Describe your storage offering"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Receiving Wallet Address
                    </label>
                    <input
                      type="text"
                      value={receivingWallet}
                      onChange={(e) => setReceivingWallet(e.target.value)}
                      placeholder="Wallet address to receive payments"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  
                  {sellAmount && sellPrice && (
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <h4 className="font-medium mb-2">Listing Summary</h4>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span>Storage Amount:</span>
                          <span>{sellAmount} GB</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Price per GB:</span>
                          <span>${sellPrice} USDC</span>
                        </div>
                        <div className="flex justify-between font-medium border-t pt-1">
                          <span>Total Earnings:</span>
                          <span className="text-green-600">
                            ${(parseFloat(sellAmount) * parseFloat(sellPrice)).toFixed(2)} USDC
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <Button
                    onClick={handleCreateListing}
                    disabled={!sellAmount || !sellPrice || processing === 'create'}
                    className="w-full"
                  >
                    {processing === 'create' ? (
                      <div className="flex items-center">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Creating Listing...
                      </div>
                    ) : (
                      <div className="flex items-center">
                        <Plus className="w-4 h-4 mr-2" />
                        Create Listing
                      </div>
                    )}
                  </Button>
                  </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* My Listings Tab */}
            <TabsContent value="mylistings" className="space-y-4">
              <div className="grid gap-4">
                {myListings.length === 0 ? (
                  <Card>
                    <CardContent className="p-8 text-center">
                      <Database className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">No Active Listings</h3>
                      <p className="text-gray-600 mb-4">You haven't created any storage listings yet.</p>
                      <Button onClick={() => setActiveTab('sell')}>
                        Create Your First Listing
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  myListings.map((listing) => (
                    <Card key={listing.id} className="border-blue-200">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-2">
                              <h3 className="font-medium">{listing.description}</h3>
                              <Badge variant={listing.status === 'active' ? 'default' : 'secondary'}>
                                {listing.status}
                              </Badge>
                              <Badge variant="outline">
                                {listing.storage_amount_gb} GB
                              </Badge>
                            </div>
                            <div className="flex items-center space-x-4 text-sm text-gray-600">
                              <span className="flex items-center">
                                <DollarSign className="w-3 h-3 mr-1" />
                                ${listing.price_per_gb}/GB
                              </span>
                              <span className="flex items-center">
                                <Eye className="w-3 h-3 mr-1" />
                                {listing.views || 0} views
                              </span>
                              <span className="flex items-center">
                                <Clock className="w-3 h-3 mr-1" />
                                {new Date(listing.created_at).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <div className="text-right mr-4">
                              <div className="font-bold text-lg">
                                ${(listing.storage_amount_gb * listing.price_per_gb).toFixed(2)}
                              </div>
                              <div className="text-xs text-gray-500">Total Value</div>
                            </div>
                            {listing.status === 'active' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleCancelListing(listing.id)}
                                disabled={processing === listing.id}
                              >
                                {processing === listing.id ? (
                                  <div className="flex items-center">
                                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-600 mr-1"></div>
                                    Cancelling...
                                  </div>
                                ) : (
                                  'Cancel'
                                )}
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      
      {/* Purchase Modal */}
      {selectedListing && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-60">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle>Purchase Storage</CardTitle>
              <p className="text-sm text-gray-600">
                Buy storage credits from {selectedListing.seller_wallet.slice(0, 6)}...{selectedListing.seller_wallet.slice(-4)}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Available:</span>
                    <span>{selectedListing.storage_amount_gb} GB</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Price per GB:</span>
                    <span>${selectedListing.price_per_gb} USDC</span>
                  </div>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Amount to Purchase (GB)
                </label>
                <input
                  type="number"
                  value={buyAmount}
                  onChange={(e) => setBuyAmount(e.target.value)}
                  placeholder={`Max: ${selectedListing.storage_amount_gb} GB`}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="0.1"
                  step="0.1"
                  max={selectedListing.storage_amount_gb}
                />
              </div>
              
              {buyAmount && (
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>Purchase Amount:</span>
                      <span>{buyAmount} GB</span>
                    </div>
                    <div className="flex justify-between font-medium">
                      <span>Total Cost:</span>
                      <span className="text-blue-600">
                        ${(parseFloat(buyAmount) * selectedListing.price_per_gb).toFixed(2)} USDC
                      </span>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedListing(null);
                    setBuyAmount('');
                  }}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => handlePurchaseListing(selectedListing, parseFloat(buyAmount) || selectedListing.storage_amount_gb)}
                  disabled={!buyAmount || parseFloat(buyAmount) <= 0 || parseFloat(buyAmount) > selectedListing.storage_amount_gb}
                  className="flex-1"
                >
                  Purchase
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      
      {/* Payment Modal */}
      {showPaymentModal && paymentCharges && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-70">
          <Card className="w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <CreditCard className="h-5 w-5" />
                <span>Complete Payment</span>
              </CardTitle>
              <p className="text-sm text-gray-600">
                Two payments are required: platform fee (10%) and seller payment (90%)
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Transaction Summary */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-medium mb-3">Transaction Summary</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Storage Amount:</span>
                    <span>{paymentCharges.transaction.storage_amount_gb} GB</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Price per GB:</span>
                    <span>${paymentCharges.transaction.price_per_gb} USDC</span>
                  </div>
                  <div className="flex justify-between font-medium border-t pt-2">
                    <span>Total Price:</span>
                    <span>${paymentCharges.transaction.total_price} USDC</span>
                  </div>
                </div>
              </div>
              
              {/* Payment 1: Platform Fee */}
              <div className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium flex items-center space-x-2">
                    <Shield className="h-4 w-4 text-blue-600" />
                    <span>Platform Fee (10%)</span>
                  </h3>
                  <span className="font-semibold">${paymentCharges.platformFee.amount} USDC</span>
                </div>
                <p className="text-sm text-gray-600 mb-3">
                  {paymentCharges.platformFee.description}
                </p>
                {completedPayments.platform ? (
                  <div className="flex items-center space-x-2 text-green-600">
                    <CheckCircle className="h-4 w-4" />
                    <span className="text-sm">Payment Completed</span>
                  </div>
                ) : (
                  <Button
                    onClick={() => {
                      window.open(paymentCharges.platformFee.charge.hosted_url, '_blank');
                      setCompletedPayments(prev => ({ ...prev, platform: true }));
                    }}
                    className="w-full"
                    variant="outline"
                  >
                    <CreditCard className="h-4 w-4 mr-2" />
                    Pay Platform Fee
                  </Button>
                )}
              </div>
              
              {/* Payment 2: Seller Payment */}
              <div className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium flex items-center space-x-2">
                    <Users className="h-4 w-4 text-green-600" />
                    <span>Seller Payment (90%)</span>
                  </h3>
                  <span className="font-semibold">${paymentCharges.sellerPayment.amount} USDC</span>
                </div>
                <p className="text-sm text-gray-600 mb-3">
                  {paymentCharges.sellerPayment.description}
                </p>
                {completedPayments.seller ? (
                  <div className="flex items-center space-x-2 text-green-600">
                    <CheckCircle className="h-4 w-4" />
                    <span className="text-sm">Payment Completed</span>
                  </div>
                ) : (
                  <Button
                    onClick={() => {
                      window.open(paymentCharges.sellerPayment.charge.hosted_url, '_blank');
                      setCompletedPayments(prev => ({ ...prev, seller: true }));
                    }}
                    className="w-full"
                    variant="outline"
                  >
                    <CreditCard className="h-4 w-4 mr-2" />
                    Pay Seller
                  </Button>
                )}
              </div>
              
              {/* Action Buttons */}
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowPaymentModal(false);
                    setPaymentCharges(null);
                    setCompletedPayments({ platform: false, seller: false });
                  }}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    if (completedPayments.platform && completedPayments.seller) {
                      handlePaymentComplete(
                        paymentCharges.platformFee.charge.id,
                        paymentCharges.sellerPayment.charge.id
                      );
                    } else {
                      toast.error('Please complete both payments first');
                    }
                  }}
                  disabled={!completedPayments.platform || !completedPayments.seller || processing === 'confirming'}
                  className="flex-1"
                >
                  {processing === 'confirming' ? (
                    <>
                      <Clock className="h-4 w-4 mr-2 animate-spin" />
                      Confirming...
                    </>
                  ) : (
                    'Confirm Purchase'
                  )}
                </Button>
              </div>
              
              <div className="text-xs text-gray-500 text-center">
                <Info className="h-3 w-3 inline mr-1" />
                Both payments must be completed before confirming the purchase
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default P2PStorageMarketplace;