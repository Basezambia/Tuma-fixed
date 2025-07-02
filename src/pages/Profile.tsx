import { useState, useEffect } from "react";
import { User, Wallet, FileText, Download, Loader2 } from "lucide-react";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { arweaveService } from '@/lib/arweave-service';
import { Avatar, getName } from '@coinbase/onchainkit/identity';
import { FundCard } from '@coinbase/onchainkit/fund';
import { base } from 'viem/chains';
import { useAccount } from 'wagmi';
import { useBalance } from 'wagmi';
import { useNavigate } from 'react-router-dom';

const formatFileSize = (size: number) => {
  if (size < 1024) {
    return `${size} B`;
  } else if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  } else if (size < 1024 * 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(2)} MB`;
  } else {
    return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
};

const Profile = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"profile" | "funding">("profile");
  const [emailNotifications, setEmailNotifications] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // PRODUCTION: Get connected user's address
  const { address, isConnected } = useAccount();
  // Update the useBalance hook to fetch USDC instead of ETH
  const { data: balanceData, isLoading: isBalanceLoading } = useBalance({
    address: address,
    chainId: base.id,
    token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' // USDC token address on Base
  });

  // PRODUCTION: Fetch real stats for the connected user
  const [documentsShared, setDocumentsShared] = useState<number | null>(null);
  const [documentsReceived, setDocumentsReceived] = useState<number | null>(null);
  const [storageUsed, setStorageUsed] = useState<number | null>(null);
  const [walletBalance, setWalletBalance] = useState<string | null>(null);

  // Basename/ENS name state
  const [resolvedName, setResolvedName] = useState<string | null>(null);
  const [nameLoading, setNameLoading] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    if (!address) return;
    setNameLoading(true);
    setNameError(null);
    getName({ address, chain: base })
      .then((name) => {
        setResolvedName(name || null);
        setNameLoading(false);
      })
      .catch((err) => {
        setResolvedName(null);
        setNameLoading(false);
        setNameError('Name resolution failed');
      });
  }, [address]);

  const fetchFileStats = async () => {
    if (!address) return;
    try {
      const [sent, received] = await Promise.all([
        arweaveService.getSentFiles(address),
        arweaveService.getReceivedFiles(address)
      ]);
      // Documents sent/received count
      setDocumentsShared(sent.length);
      setDocumentsReceived(received.length);
      // Storage used (sum of all sent + received file sizes in MB)
      const sentSize = sent.reduce((acc, file) => acc + (file.metadata?.size || 0), 0);
      const receivedSize = received.reduce((acc, file) => acc + (file.metadata?.size || 0), 0);
      const totalSize = sentSize + receivedSize;
      setStorageUsed(Number(totalSize)); // store as number (bytes)
    } catch (err) {
      setDocumentsShared(null);
      setDocumentsReceived(null);
      setStorageUsed(null);
    }
  };

  useEffect(() => {
    fetchFileStats();
  }, [address]);

  // Listen for new sent files to update the count
  useEffect(() => {
    const handleNewSentFile = () => {
      // Add delay to account for Arweave indexing
      setTimeout(() => {
        fetchFileStats();
      }, 2000); // 2 second delay
    };

    const handleUploadComplete = () => {
      // Add delay to account for Arweave indexing
      setTimeout(() => {
        fetchFileStats();
      }, 3000); // 3 second delay for upload complete
    };

    window.addEventListener('tuma:newSentFile', handleNewSentFile);
    window.addEventListener('uploadComplete', handleUploadComplete);
    
    return () => {
      window.removeEventListener('tuma:newSentFile', handleNewSentFile);
      window.removeEventListener('uploadComplete', handleUploadComplete);
    };
  }, [address]);

  useEffect(() => {
    if (balanceData && balanceData.formatted) {
      setWalletBalance(`${parseFloat(balanceData.formatted).toFixed(2)} ${balanceData.symbol}`);
    } else {
      setWalletBalance(null);
    }
  }, [balanceData]);

  // Inject custom styles for FundCard in dark mode
  useEffect(() => {
    const styleElement = document.createElement('style');
    styleElement.textContent = `
      /* Override FundCard styles in dark mode - match page background */
      .dark .custom-fund-card-container div,
      .dark .custom-fund-card-container span,
      .dark .custom-fund-card-container p,
      .dark .custom-fund-card-container h1,
      .dark .custom-fund-card-container h2,
      .dark .custom-fund-card-container h3,
      .dark .custom-fund-card-container h4,
      .dark .custom-fund-card-container h5,
      .dark .custom-fund-card-container h6 {
        background-color: #191919 !important; /* Match page background */
        color: white !important;
        border-color: #222222 !important;
      }
      
      /* Make buttons match the background but keep borders and text */
      .dark .custom-fund-card-container button {
        background-color: #191919 !important; /* Match page background */
        color: white !important;
        border-color: #444444 !important;
      }
      
      .dark .custom-fund-card-container input {
        background-color: #222222 !important;
        color: white !important;
        border: 1px solid #333333 !important;
      }
      
      /* Target specific FundCard elements */
      .dark iframe[title="Coinbase"],
      .dark .custom-fund-card-container iframe,
      .dark .custom-fund-card-container [class*="Card"],
      .dark .custom-fund-card-container [class*="card"],
      .dark .custom-fund-card-container [class*="Container"],
      .dark .custom-fund-card-container [class*="container"] {
        background-color: #191919 !important; /* Match page background */
        border-color: #222222 !important;
      }
      
      /* Ensure the root container has the dark background */
      .dark .custom-fund-card-container {
        background-color: #191919 !important;
      }
      
      /* Make ETH icon white for better visibility */
      .dark svg[data-lucide="Coins"],
      .dark .custom-fund-card-container svg,
      .dark .custom-fund-card-container path,
      .dark .custom-fund-card-container [class*="icon"],
      .dark .custom-fund-card-container [class*="Icon"] {
        fill: white !important;
        stroke: white !important;
        color: white !important;
      }
      
      /* Remove gray highlight on the zero */
      .dark .custom-fund-card-container [class*="input"],
      .dark .custom-fund-card-container [class*="Input"],
      .dark .custom-fund-card-container input,
      .dark .custom-fund-card-container [class*="field"],
      .dark .custom-fund-card-container [class*="Field"] {
        background-color: transparent !important;
        border-color: #333333 !important;
      }
      
      /* Fix z-index for Coinbase dropdown on mobile */
      .custom-fund-card-container,
      .custom-fund-card-container iframe,
      .custom-fund-card-container [class*="dropdown"],
      .custom-fund-card-container [class*="Dropdown"],
      .custom-fund-card-container [class*="menu"],
      .custom-fund-card-container [class*="Menu"],
      .custom-fund-card-container [class*="popover"],
      .custom-fund-card-container [class*="Popover"],
      .custom-fund-card-container [class*="modal"],
      .custom-fund-card-container [class*="Modal"] {
        z-index: 9999 !important;
        position: relative !important;
      }
      
      /* Ensure funding component appears above sidebar on mobile */
      @media (max-width: 1024px) {
        .custom-fund-card-container {
          z-index: 9999 !important;
          position: relative !important;
        }
        
        .custom-fund-card-container * {
          z-index: inherit !important;
        }
      }
      
      /* Remove text shadow/glow from the Purchase button text - more specific targeting */
      .dark .custom-fund-card-container button,
      .dark .custom-fund-card-container [role="button"],
      .dark .custom-fund-card-container [class*="Button"],
      .dark .custom-fund-card-container [class*="button"],
      .dark .custom-fund-card-container [class*="Btn"],
      .dark .custom-fund-card-container [class*="btn"] {
        text-shadow: none !important;
        box-shadow: none !important;
        background-image: none !important;
        background-clip: none !important;
        -webkit-background-clip: none !important;
        -webkit-text-fill-color: white !important;
        filter: none !important;
      }
      
      /* Target the text inside buttons specifically */
      .dark .custom-fund-card-container button span,
      .dark .custom-fund-card-container [role="button"] span,
      .dark .custom-fund-card-container button div,
      .dark .custom-fund-card-container [role="button"] div,
      .dark .custom-fund-card-container button p,
      .dark .custom-fund-card-container [role="button"] p {
        text-shadow: none !important;
        background: none !important;
        background-image: none !important;
        background-clip: none !important;
        -webkit-background-clip: none !important;
        -webkit-text-fill-color: white !important;
        filter: none !important;
      }
    `;
    document.head.appendChild(styleElement);
    
    return () => {
      document.head.removeChild(styleElement);
    };
  }, []);
  
  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-blue-50 dark:from-[#191919] dark:to-[#191919] page-transition">
      <Header />
      <main className="pt-20 sm:pt-28 px-3 sm:px-4 lg:px-6 pb-12 sm:pb-16 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 sm:mb-8 gap-4">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight dark:text-white">Dashboard</h1>
          <div className="flex space-x-2">
            <Button 
              variant={activeTab === "profile" ? "default" : "outline"} 
              onClick={() => setActiveTab("profile")}
              className={`flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 text-sm sm:text-base ${activeTab === "profile" ? "bg-teal-700 hover:bg-teal-800 text-white" : ""}`}
            >
              <User size={16} className="sm:hidden" />
              <User size={18} className="hidden sm:block" />
              <span className="hidden sm:inline">Profile</span>
              <span className="sm:hidden">Profile</span>
            </Button>
            <Button 
              variant={activeTab === "funding" ? "default" : "outline"} 
              onClick={() => setActiveTab("funding")}
              className={`flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 text-sm sm:text-base ${activeTab === "funding" ? "bg-teal-700 hover:bg-teal-800 text-white" : ""}`}
            >
              <Wallet size={16} className="sm:hidden" />
              <Wallet size={18} className="hidden sm:block" />
              <span className="hidden sm:inline">Fund Wallet</span>
              <span className="sm:hidden">Fund</span>
            </Button>
          </div>
        </div>
        {activeTab === "profile" ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
            {/* Main profile area */}
            <div className="backdrop-blur-xl bg-white/40 dark:bg-gray-800 border border-white/20 dark:border-gray-700 shadow-lg rounded-xl p-4 sm:p-6 lg:col-span-2">
              <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
                {/* OnchainKit Avatar and Name for Basename display */}
                {isConnected && address ? (
                  <>
                    <Avatar address={address} chain={base} />
                    <div>
                      <h2 className="text-lg sm:text-xl font-semibold dark:text-white">Your Profile</h2>
                      {nameLoading ? (
                        <span className="text-sm sm:text-base text-gray-500 dark:text-gray-400 animate-pulse">Resolving name...</span>
                      ) : resolvedName ? (
                        <span className="text-base sm:text-lg font-bold text-blue-700 dark:text-blue-400">{resolvedName}</span>
                      ) : nameError ? (
                        <span className="text-xs sm:text-sm text-red-500">{nameError}</span>
                      ) : (
                        <span className="text-sm sm:text-lg font-mono text-gray-600 dark:text-gray-300">{address?.slice(0, 6)}...{address?.slice(-4)}</span>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-2"><User /><span className="text-gray-500">Not connected</span></div>
                )}
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-2 gap-3 sm:gap-4 lg:gap-6 mb-6 sm:mb-8">
                <div className="bg-white/60 dark:bg-gray-800 rounded-xl p-3 sm:p-4 shadow-sm border border-white/20 dark:border-gray-700 hover:shadow-lg hover:-translate-y-1 hover:bg-white/80 dark:hover:bg-gray-700/80 transition-all duration-200 cursor-pointer">
                  <h3 className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1">Documents Shared</h3>
                  <p className="text-xl sm:text-2xl lg:text-3xl font-bold dark:text-white">{documentsShared !== null ? documentsShared : '-'}</p>
                </div>
                <div className="bg-white/60 dark:bg-gray-800 rounded-xl p-3 sm:p-4 shadow-sm border border-white/20 dark:border-gray-700 hover:shadow-lg hover:-translate-y-1 hover:bg-white/80 dark:hover:bg-gray-700/80 transition-all duration-200 cursor-pointer">
                  <h3 className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1">Documents Received</h3>
                  <p className="text-xl sm:text-2xl lg:text-3xl font-bold dark:text-white">{documentsReceived !== null ? documentsReceived : '-'}</p>
                </div>
                <div className="bg-white/60 dark:bg-gray-800 rounded-xl p-3 sm:p-4 shadow-sm border border-white/20 dark:border-gray-700 hover:shadow-lg hover:-translate-y-1 hover:bg-white/80 dark:hover:bg-gray-700/80 transition-all duration-200 cursor-pointer">
                  <h3 className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1">Total Storage Used</h3>
                  <p className="text-xl sm:text-2xl lg:text-3xl font-bold dark:text-white">{storageUsed !== null ? formatFileSize(storageUsed) : '-'}</p>
                </div>
                <div className="bg-white/60 dark:bg-gray-800 rounded-xl p-3 sm:p-4 shadow-sm border border-white/20 dark:border-gray-700 hover:shadow-lg hover:-translate-y-1 hover:bg-white/80 dark:hover:bg-gray-700/80 transition-all duration-200 cursor-pointer">
                  <h3 className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1">Wallet Balance</h3>
                  <p className="text-xl sm:text-2xl lg:text-3xl font-bold dark:text-white">{walletBalance !== null ? walletBalance : '-'}</p>
                </div>
              </div>
              <div className="mb-6 sm:mb-8">
                <h3 className="text-base sm:text-lg font-semibold mb-3 dark:text-white">Account Settings</h3>
                <div className="bg-white/60 dark:bg-gray-800 rounded-xl p-3 sm:p-4 shadow-sm mb-3 hover:shadow-lg hover:-translate-y-1 hover:bg-white/80 dark:hover:bg-gray-700/80 transition-all duration-200 cursor-pointer">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm sm:text-base font-medium dark:text-white">Email Notifications</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">Receive email notifications when documents are shared with you</p>
                    </div>
                    <Switch 
                      checked={emailNotifications} 
                      onCheckedChange={setEmailNotifications} 
                    />
                  </div>
                </div>
                <div className="bg-white/60 dark:bg-gray-800 rounded-xl p-3 sm:p-4 shadow-sm hover:shadow-lg hover:-translate-y-1 hover:bg-white/80 dark:hover:bg-gray-700/80 transition-all duration-200 cursor-pointer">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm sm:text-base font-medium dark:text-white">Two-Factor Authentication</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">Add an extra layer of security to your account</p>
                    </div>
                    <Button variant="link" className="text-blue-600 dark:text-blue-400 text-sm sm:text-base">
                      Enable
                    </Button>
                  </div>
                </div>
              </div>
            </div>
            {/* Sidebar */}
            <div className="space-y-4 sm:space-y-6 relative z-[5]">
              <div className="backdrop-blur-xl bg-white/40 dark:bg-gray-800 border border-white/20 dark:border-gray-700 shadow-lg rounded-xl p-4 sm:p-6">
                <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 dark:text-white">Wallet Info</h3>
                <div className="mb-3 sm:mb-4">
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Current Balance</p>
                  <p className="text-xl sm:text-2xl font-bold dark:text-white">{walletBalance !== null ? walletBalance : '-'}</p>
                </div>
                <Button 
                  className="w-full bg-teal-700 hover:bg-teal-800 text-white text-sm sm:text-base" 
                  onClick={() => setActiveTab("funding")}
                >
                  Fund Wallet
                </Button>
              </div>
              {/* Storage Usage Section - Hidden in Alpha */}
              {false && (
                <div className="backdrop-blur-xl bg-white/40 dark:bg-gray-800 border border-white/20 dark:border-gray-700 shadow-lg rounded-xl p-4 sm:p-6">
                  <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 dark:text-white">Storage Usage</h3>
                  <div className="mb-2">
                    <div className="flex justify-between text-xs sm:text-sm mb-1">
                      <span className="text-gray-500 dark:text-gray-400">Used: {storageUsed !== null ? formatFileSize(storageUsed) : '-'}</span>
                    </div>
                    <Progress value={storageUsed !== null ? storageUsed : 0} max={1000 * 1024 * 1024} className="h-2" />
                  </div>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-3 sm:mb-4">
                    You're using {storageUsed !== null ? formatFileSize(storageUsed) : '-'} of storage.
                  </p>
                  <Button 
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm sm:text-base"
                    onClick={() => navigate('/storage')}
                  >
                    Manage Storage
                  </Button>
                </div>
              )}
              
              {/* Secure Vault Component */}
              <div className="backdrop-blur-xl bg-white/40 dark:bg-gray-800 border border-white/20 dark:border-gray-700 shadow-lg rounded-xl p-4 sm:p-6">
                <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 dark:text-white">Secure Vault</h3>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-2">Premium File Storage</p>
                
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 mb-3 sm:mb-4">
                  Store your most valuable documents and files in an encrypted, password-protected vault.
                  Only accessible with your secure password.
                </p>
                
                <div className="flex items-center gap-2 mb-3 sm:mb-4">
                  <div className="h-4 w-4 sm:h-5 sm:w-5 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5 text-xs">•</div>
                  <span className="text-xs sm:text-sm dark:text-gray-300">End-to-End Encrypted</span>
                </div>
                
                <Button 
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white text-sm sm:text-base"
                  onClick={() => navigate('/vault')}
                >
                  Open Vault
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
            {/* Funding area */}
            <div className="backdrop-blur-xl bg-white/40 dark:bg-gray-800 border border-white/20 dark:border-gray-700 shadow-lg rounded-xl p-4 sm:p-6 lg:col-span-2">
              <h2 className="text-xl sm:text-2xl font-bold mb-3 sm:mb-4 dark:text-white">Fund Your Wallet</h2>
              <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mb-4 sm:mb-6">
                Purchase USDC to pay for document sharing and gas fees. Choose an amount below or enter a custom amount.
              </p>
              <div className="mt-4 sm:mt-6 custom-fund-card-container relative z-[100]">
                <FundCard
                  assetSymbol="USDC"
                  country="US"
                  currency="USD"
                  headerText="Purchase USDC"
                  buttonText="Purchase"
                  presetAmountInputs={['10', '20', '50']}
                />
              </div>

            </div>
            {/* Sidebar */}
            <div className="space-y-4 sm:space-y-6 relative z-[1]">
              <div className="backdrop-blur-xl bg-white/40 dark:bg-gray-800 border border-white/20 dark:border-gray-700 shadow-lg rounded-xl p-4 sm:p-6">
                <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 dark:text-white">About Funding</h3>
                <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mb-3 sm:mb-4">
                  TUMA uses blockchain technology to securely share your documents. To use the service, you'll need USDC in your wallet to pay for:
                </p>
                <ul className="space-y-2 mb-3 sm:mb-4">
                  <li className="flex items-start gap-2">
                    <div className="h-4 w-4 sm:h-5 sm:w-5 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5 text-xs">•</div>
                    <span className="text-xs sm:text-sm dark:text-gray-300">Document sharing fees</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="h-4 w-4 sm:h-5 sm:w-5 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5 text-xs">•</div>
                    <span className="text-xs sm:text-sm dark:text-gray-300">Gas fees for blockchain transactions</span>
                  </li>
                </ul>
              </div>
              <div className="backdrop-blur-xl bg-white/40 dark:bg-gray-800 border border-white/20 dark:border-gray-700 shadow-lg rounded-xl p-4 sm:p-6">
                <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 dark:text-white">Need Help?</h3>
                <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mb-3 sm:mb-4">
                  If you're having trouble funding your wallet or have questions about pricing, our support team is here to help.
                </p>
                <Button variant="outline" className="w-full text-sm sm:text-base">
                  Contact Support →
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Profile;
