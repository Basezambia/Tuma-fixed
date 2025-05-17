import { useState, useEffect, useCallback } from "react";
import { FileUp, Send as SendIcon, User, Users, X, AlertCircle, Coins, Clock, Bell } from "lucide-react";
import { toast } from "sonner";
import Header from "@/components/Header";
import { arweaveService, FileMetadata } from "@/lib/arweave-service";
import { encryptFileBufferHKDF } from '@/lib/encryption';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useAccount } from 'wagmi';
import { Checkout, CheckoutButton, CheckoutStatus } from '@coinbase/onchainkit/checkout';

const Send = () => {
  // ...existing state declarations...
  const [uploadTimeoutId, setUploadTimeoutId] = useState<NodeJS.Timeout | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [recipient, setRecipient] = useState("");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [calculatedFee, setCalculatedFee] = useState<string | null>(null);
  const [fileSizeTier, setFileSizeTier] = useState<string | null>(null);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [serviceFee, setServiceFee] = useState<string>('2.00'); // Example: $2.00 USDC
  const [paymentCurrency, setPaymentCurrency] = useState<'USDC'>('USDC');
  const [documentId, setDocumentId] = useState("");
  const [arweaveTxId, setArweaveTxId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'pending' | 'processing' | 'success' | 'error'>('idle');
  const [chargeId, setChargeId] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false); // Controls the Checkout modal
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadComplete, setUploadComplete] = useState(false);

  // Free tier usage tracking
  const [freeTierUsage, setFreeTierUsage] = useState<number>(() => {
    const stored = localStorage.getItem('freeTierUsage');
    return stored ? parseInt(stored, 10) : 0;
  });
  const [lastFreeTierReset, setLastFreeTierReset] = useState<number>(() => {
    const stored = localStorage.getItem('lastFreeTierReset');
    return stored ? parseInt(stored, 10) : Date.now();
  });

  const { address: senderAddress } = useAccount();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const removeFile = () => {
    setFile(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!file) {
      toast.error("Please select a file to send");
      return;
    }
    
    if (!recipient) {
      toast.error("Please enter a recipient");
      return;
    }

    if (!recipientAddress) {
      toast.error("Please enter a valid recipient wallet address");
      return;
    }
    
    try {
      // Start sending process
      setSending(true);
      
      // 1. Upload file to Arweave
      const metadata: FileMetadata = {
        name: file.name,
        type: file.type,
        size: file.size,
        sender: senderAddress,
        recipient: recipientAddress,
        timestamp: Date.now(),
        description: message || undefined
      };
      
      // Generate a unique document ID
      const tempDocId = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      setDocumentId(tempDocId);
      
      // Show payment confirmation
      setShowPaymentDialog(true);
      // Do NOT call handlePostPaymentUpload here!
      setSending(false);
    } catch (error) {
      console.error("Error preparing document:", error);
      toast.error("Failed to prepare document for sending");
      setSending(false);
    }
  };

  useEffect(() => {
    if (file) {
      let tier = null;
      let fee = null;
      const sizeMB = file.size / 1024 / 1024;
      // Pricing tiers
      if (sizeMB < 0.1) {
        tier = 'Tier 1 (<100KB)';
        fee = '0.05';
      } else if (sizeMB < 20) {
        tier = 'Tier 2 (100KB-20MB)';
        fee = '1.00';
      } else if (sizeMB < 50) {
        tier = 'Tier 3 (20-50MB)';
        fee = '2.00';
      } else if (sizeMB < 100) {
        tier = 'Tier 4 (50-100MB)';
        fee = '3.00';
      } else {
        tier = 'Tier 5 (>100MB)';
        fee = '5.00';
      }
      setFileSizeTier(tier);
      setServiceFee(fee);
    }
  }, [file]);


  // Effect: When chargeId changes and paymentStatus is 'pending', wait 30s before starting upload

  // Auto-close payment dialog after 10 seconds if not closed by user

  // Cleanup timeout if upload starts or completes
  useEffect(() => {
    if (uploading || uploadComplete) {
      if (uploadTimeoutId) {
        clearTimeout(uploadTimeoutId);
        setUploadTimeoutId(null);
      }
    }
  }, [uploading, uploadComplete]);

  // Auto-close dialog 5 seconds after upload completes
  useEffect(() => {
    if (uploadComplete) {
      const closeTimer = setTimeout(() => {
        setShowPaymentDialog(false);
      }, 5000);
      return () => clearTimeout(closeTimer);
    }
  }, [uploadComplete]);

  // Poll Coinbase Commerce charge status
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (
      paymentStatus === 'processing' &&
      chargeId &&
      !uploading &&
      !uploadComplete &&
      !uploadError
    ) {
      const poll = async () => {
        try {
          const res = await fetch(`/api/chargeStatus?chargeId=${chargeId}`);
          const data = await res.json();
          if (data.statusName && ['PENDING', 'pending'].includes(data.statusName)) {
            setPaymentStatus('pending');
            setPaymentError(null);
            setShowPaymentDialog(false);
            setTimeout(() => handlePostPaymentUpload(), 500); // slight delay for UI
          } else if (data.statusName && ['CONFIRMED', 'COMPLETED', 'confirmed', 'completed', 'RESOLVED', 'resolved', 'PAID', 'paid', 'SUCCESS', 'success'].includes(data.statusName)) {
            setPaymentStatus('success');
            setPaymentError(null);
            setShowPaymentDialog(false);
            setTimeout(() => handlePostPaymentUpload(), 500); // slight delay for UI
          } else if (data.statusName && data.statusName.toLowerCase().includes('error')) {
            setPaymentStatus('error');
            setPaymentError('Payment failed');
          }
        } catch (e: any) {
          // Optionally: setPaymentError(e.message);
        }
      };
      poll();
      interval = setInterval(poll, 5000);
    }
    return () => interval && clearInterval(interval);
  }, [paymentStatus, chargeId, uploading, uploadComplete, uploadError]);

  // Real Coinbase Commerce checkout handler
  const chargeHandler = useCallback(async () => {
    try {
      setPaymentStatus('processing');
      setPaymentError(null);
      // Call backend to create charge with correct amount
      const response = await fetch('/api/createCharge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: serviceFee,
          currency: paymentCurrency,
          name: 'Document Payment',
          description: `Payment for document (tier: ${fileSizeTier})`,
          metadata: { sender: senderAddress, recipient: recipientAddress, documentId }
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to create charge');
      setChargeId(data.id); // store chargeId for polling
      setPaymentStatus('pending'); // set payment status to pending immediately after charge creation
      // Timer is now handled by the effect that depends on chargeId and paymentStatus
      return data.id; // chargeId
    } catch (err: any) {
      setPaymentStatus('error');
      setPaymentError(err.message || 'Failed to create charge');
      throw err;
    }
  }, [serviceFee, paymentCurrency, fileSizeTier, senderAddress, recipientAddress, documentId]);

  const retryPayment = () => {
    setShowPaymentDialog(true);
    setPaymentStatus('idle');
    setPaymentError(null);
  };

  const handlePostPaymentUpload = async () => {
    if (uploading) return;
    setUploading(true);
    setUploadError(null);
    setUploadProgress(0);
    setUploadComplete(false);
    const fileToUpload = file;
    const recipientToSend = recipient;
    const recipientAddressToSend = recipientAddress;
    const messageToSend = message;
    setFile(null);
    setRecipient("");
    setRecipientAddress("");
    setMessage("");
    let cipherArr;
    let metadata;
    try {
      if (!file || !recipientAddress || !senderAddress) throw new Error('Missing file or addresses');
      const buffer = await file.arrayBuffer();
      if (!documentId) throw new Error('Missing documentId for salt');
      const { ciphertext, iv } = await encryptFileBufferHKDF(buffer, senderAddress.toLowerCase(), recipientAddress.toLowerCase(), documentId);
      const hashBuffer = await crypto.subtle.digest('SHA-256', Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0)));
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const sha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      metadata = {
        name: file.name,
        type: file.type,
        size: file.size,
        sender: senderAddress.toLowerCase(),
        recipient: recipientAddress.toLowerCase(),
        timestamp: Date.now(),
        description: message || undefined,
        iv,
        sha256,
        chargeId: chargeId || undefined,
        documentId,
      };
      if (typeof ciphertext === 'string') {
        try {
          cipherArr = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
        } catch (e) {
          throw new Error('Failed to convert ciphertext to Uint8Array');
        }
      } else {
        throw new Error('Invalid ciphertext type');
      }
    } catch (err) {
      setUploadError(err.message || 'Upload failed');
      setUploading(false);
      toast.error('Upload failed: ' + (err.message || 'Unknown error'));
      return;
    }
    const toastId = toast.loading('Uploading file to Arweave and waiting for confirmation...');
    try {
      const arweaveTxId = await arweaveService.uploadFileToArweave(
        cipherArr,
        metadata,
        (pct) => setUploadProgress(Math.round(pct))
      );
      setArweaveTxId(arweaveTxId);
      setUploadComplete(true);
      toast.success('File sent and stored on Arweave!', { id: toastId });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('tuma:newSentFile', { detail: {
          id: arweaveTxId,
          metadata
        }}));
      }
      setFile(null);
      setRecipient("");
      setRecipientAddress("");
      setMessage("");
      saveRecentRecipient({ name: recipient, address: recipientAddress });
      setUploadProgress(null);
    } finally {
      setUploading(false);
    }
  };



  // State for recent recipients
  const [recentRecipients, setRecentRecipients] = useState<{ name: string; address: string; lastSent?: number }[]>([]);
  const [isLoadingRecipients, setIsLoadingRecipients] = useState(false);

  // --- Recent Recipients: Local Storage Logic ---
  const RECENT_RECIPIENTS_KEY = 'recentRecipients';

  function saveRecentRecipient(recipient: { name: string; address: string }) {
    const existing: { name: string; address: string; lastSent?: number }[] = JSON.parse(localStorage.getItem(RECENT_RECIPIENTS_KEY) || '[]');
    // Remove duplicates
    const filtered = existing.filter((r) => r.address !== recipient.address);
    const updated = [{ ...recipient, lastSent: Date.now() }, ...filtered].slice(0, 10); // Increased limit to 10
    localStorage.setItem(RECENT_RECIPIENTS_KEY, JSON.stringify(updated));
  }

  function loadRecentRecipients(): { name: string; address: string; lastSent?: number }[] {
    return JSON.parse(localStorage.getItem(RECENT_RECIPIENTS_KEY) || '[]');
  }

  // Load recent recipients when component mounts or address changes
  useEffect(() => {
    if (!senderAddress) return;
    
    setIsLoadingRecipients(true);
    
    // First load from local storage
    const localRecipients = loadRecentRecipients();
    
    // Then fetch sent files from Arweave to extract recipients
    arweaveService.getSentFiles(senderAddress)
      .then(files => {
        // Extract unique recipients from sent files
        const recipientsFromSentFiles = files.reduce((acc: { name: string; address: string; lastSent?: number }[], file) => {
          const recipientAddress = file.metadata.recipient?.toLowerCase();
          if (!recipientAddress) return acc;
          
          // Skip if we already have this recipient in our accumulator
          if (acc.some(r => r.address.toLowerCase() === recipientAddress)) return acc;
          
          // Create a recipient entry
          const recipientName = file.metadata.name ? `${file.metadata.name.split('_')[0]}` : 'Unknown';
          return [...acc, {
            name: recipientName,
            address: recipientAddress,
            lastSent: file.metadata.timestamp || Date.now()
          }];
        }, []);
        
        // Merge local and blockchain recipients, prioritizing local ones (as they have user-defined names)
        const mergedRecipients = [...localRecipients];
        
        // Add blockchain recipients that aren't already in local storage
        recipientsFromSentFiles.forEach(blockchainRecipient => {
          if (!mergedRecipients.some(r => r.address.toLowerCase() === blockchainRecipient.address.toLowerCase())) {
            mergedRecipients.push(blockchainRecipient);
          }
        });
        
        // Sort by most recent first
        const sortedRecipients = mergedRecipients.sort((a, b) => 
          (b.lastSent || 0) - (a.lastSent || 0)
        );
        
        setRecentRecipients(sortedRecipients);
      })
      .catch(error => {
        console.error('Error loading recipients from blockchain:', error);
        // Fall back to local storage only
        setRecentRecipients(localRecipients);
      })
      .finally(() => {
        setIsLoadingRecipients(false);
      });
  }, [senderAddress]);

  // Format relative time (e.g., "2 days ago")
  const formatRelativeTime = (date: Date): string => {
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffInSeconds < 60) return 'just now';
    
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 30) return `${diffInDays}d ago`;
    
    const diffInMonths = Math.floor(diffInDays / 30);
    return `${diffInMonths}mo ago`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-blue-50 dark:from-[#191919] dark:to-[#191919] page-transition">
      <Header />
      
      <main className="pt-28 px-6 pb-16 max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">Send Files</h1>
          <p className="text-doc-medium-gray">
            Share files securely with individuals or teams
          </p>
        </div>
        
        <div className="grid md:grid-cols-3 gap-8">
          <div className="md:col-span-2">
            <div className="glass-panel p-8">
              <form onSubmit={handleSubmit}>
                <div className="mb-8">
                  <label className="block text-sm font-medium mb-2">
                    Select File
                  </label>
                  {!file ? (
                    <label htmlFor="file" tabIndex={0}
                      className="group transition-all duration-200 border-2 border-dashed border-doc-pale-gray dark:border-gray-600 rounded-xl p-12 text-center bg-white dark:bg-gray-800 hover:shadow-2xl hover:scale-103 hover:bg-blue-50/60 dark:hover:bg-blue-900/40 cursor-pointer ease-in-out flex flex-col items-center justify-center focus-within:shadow-2xl focus-within:scale-103"
                    >
                      <FileUp className="mx-auto h-14 w-14 text-doc-medium-gray mb-4 transition-all duration-200 group-hover:text-doc-deep-blue" />
                      <p className="text-doc-medium-gray mb-6 text-lg font-medium group-hover:text-doc-deep-blue">
                        Drag and drop a file, or click to select
                      </p>
                      <input
                        type="file"
                        id="file"
                        accept="*/*"
                        onChange={handleFileChange}
                        className="hidden"
                        tabIndex={-1}
                      />
                    </label>
                  ) : (
                    <div className="flex items-center p-4 bg-doc-soft-blue dark:bg-blue-900/30 rounded-lg animate-scale-in">
                      <div className="mr-4">
                        <div className="w-12 h-12 rounded-lg bg-white dark:bg-gray-700 flex items-center justify-center">
                          <FileUp size={24} className="text-doc-deep-blue" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{file.name}</p>
                        <p className="text-xs text-doc-medium-gray">
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={removeFile}
                        className="p-1.5 rounded-full hover:bg-white dark:hover:bg-gray-700 transition-colors text-doc-medium-gray"
                      >
                        <X size={18} />
                      </button>
                    </div>
                  )}
                </div>

                  <div className="mb-6">
                    <label 
                      htmlFor="recipient"
                      className="block text-sm font-medium mb-2"
                    >
                      Recipient Name
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <User size={18} className="text-doc-medium-gray" />
                      </div>
                      <input
                        type="text"
                        id="recipient"
                        placeholder="Recipient name or organization"
                        className="pl-10 w-full bg-white dark:bg-gray-700 border-none rounded-lg focus:ring-1 focus:ring-blue-500 outline-none py-3 text-gray-800 dark:text-white"
                        value={recipient}
                        onChange={(e) => setRecipient(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="mb-6">
                    <label 
                      htmlFor="recipientAddress"
                      className="block text-sm font-medium mb-2"
                    >
                      Recipient Wallet Address
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-doc-medium-gray">
                          <rect x="2" y="6" width="20" height="12" rx="2" />
                          <path d="M22 10H2" />
                        </svg>
                      </div>
                      <input
                        type="text"
                        id="recipientAddress"
                        placeholder="0x..."
                        className="pl-10 w-full bg-white dark:bg-gray-700 border-none rounded-lg focus:ring-1 focus:ring-blue-500 outline-none py-3 text-gray-800 dark:text-white"
                        value={recipientAddress}
                        onChange={(e) => setRecipientAddress(e.target.value)}
                      />
                    </div>
                    <p className="text-xs text-doc-medium-gray mt-1">
                      Enter the recipient's Ethereum address
                    </p>
                  </div>

                <div className="mb-8">
                  <label 
                    htmlFor="message"
                    className="block text-sm font-medium mb-2"
                  >
                    Message (Optional)
                  </label>
                  <textarea
                    id="message"
                    rows={4}
                    placeholder="Add a message to the recipient..."
                    className="w-full bg-white dark:bg-gray-700 border-none rounded-lg focus:ring-1 focus:ring-blue-500 outline-none py-3 px-4 text-gray-800 dark:text-white"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={sending}
                    className={`
                      inline-flex items-center px-6 py-3 rounded-lg
                      ${sending
                        ? "bg-blue-400 cursor-not-allowed"
                        : "bg-doc-deep-blue hover:bg-blue-600"}
                      text-white font-medium transition-colors
                    `}
                  >
                    {sending ? (
                      <>
                        <div className="animate-spin mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                        Preparing...
                      </>
                    ) : (
                      <>
                        <SendIcon size={18} className="mr-2" />
                        Send
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
          
          <div>
            <div className="glass-panel p-6">
              <div className="flex items-center mb-4">
                <Users size={18} className="text-doc-deep-blue mr-2" />
                <h3 className="font-medium">Recent Recipients</h3>
              </div>
              <div className="space-y-3">
                {isLoadingRecipients ? (
                  <div className="py-6 text-center">
                    <div className="animate-spin mx-auto h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full mb-2"></div>
                    <p className="text-doc-medium-gray">Loading recent recipients...</p>
                  </div>
                ) : recentRecipients.length > 0 ? (
                  recentRecipients.slice(0, 4).map((recipient) => (
                    <button
                      key={recipient.address}
                      onClick={() => {
                        setRecipient(recipient.name);
                        setRecipientAddress(recipient.address);
                      }}
                      className="flex items-center w-full p-3 rounded-lg hover:bg-doc-soft-blue dark:hover:bg-blue-900/30 transition-colors text-left"
                    >
                      <div className="w-8 h-8 rounded-full bg-doc-deep-blue text-white flex items-center justify-center mr-3">
                        {recipient.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{recipient.name}</p>
                        <p className="text-xs text-doc-medium-gray truncate">{recipient.address}</p>
                      </div>
                      <div className="text-xs text-doc-medium-gray flex items-center">
                        <Clock size={12} className="mr-1" />
                        {formatRelativeTime(new Date(recipient.lastSent))}
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="py-6 text-center text-doc-medium-gray">
                    <p>No recent recipients found</p>
                    <p className="text-xs mt-1">Recipients will appear here after you send files</p>
                  </div>
                )}
              </div>
            </div>
            
            <div className="glass-panel p-6 mt-6">
              <h3 className="font-medium mb-4">Send Tips</h3>
              <ul className="space-y-3 text-sm text-doc-medium-gray">
                <li className="flex">
                  <span className="text-doc-deep-blue mr-2">•</span>
                  Files are encrypted end-to-end for security
                </li>
                <li className="flex">
                  <span className="text-doc-deep-blue mr-2">•</span>
                  Maximum file size is 200MB
                </li>
                <li className="flex">
                  <span className="text-doc-deep-blue mr-2">•</span>
                  Files exist forever, only pay once
                </li>
              </ul>
            </div>
            
            <div className="glass-panel p-6 mt-6">
              <h3 className="font-medium mb-4">Pricing Tiers</h3>
              <ul className="space-y-3 text-sm">
                <li className="flex justify-between">
                  <span className="text-doc-medium-gray">Tier 1 (&lt;10MB):</span>
                  <span className="font-medium">0.05 USDC</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-doc-medium-gray">Tier 2 (10-50MB):</span>
                  <span className="font-medium">1.00 USDC</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-doc-medium-gray">Tier 3 (50-100MB):</span>
                  <span className="font-medium">2.00 USDC</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-doc-medium-gray">Tier 4 (&gt;100MB):</span>
                  <span className="font-medium">5.00 USDC</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </main>
      <Dialog
        open={showPaymentDialog && !(uploadComplete && !uploading && !uploadError)}
        onOpenChange={(open) => {
          if (!open) {
            setShowPaymentDialog(false);
            // Only clear/reset form if upload has started or completed
            if (uploading || uploadComplete) {
              setPaymentStatus('idle');
              setPaymentError(null);
              setFile(null);
              setRecipient("");
              setRecipientAddress("");
              setMessage("");
            }
          }
        }}
      >
        <DialogContent
          className="relative flex flex-col items-center justify-center !top-1/2 !left-1/2 !-translate-x-1/2 !-translate-y-1/2 max-w-md w-full"
          style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
          onPointerDownOutside={uploading ? (e) => e.preventDefault() : undefined}
          onEscapeKeyDown={uploading ? (e) => e.preventDefault() : undefined}
        >
          <DialogHeader className="flex flex-col items-center">
            <DialogTitle className="text-center w-full">Service Fee Payment</DialogTitle>
          </DialogHeader>
          {uploading ? (
            <div className="mb-4 text-blue-500 text-center">
              You can close this dialog. You will be notified via the notification bell when your file upload is complete.
            </div>
          ) : (
            <div className="mb-4 flex flex-col items-center">
              <p className="text-doc-medium-gray mb-2 text-center">
                To send this file securely, a service fee is required. The platform will cover Arweave storage costs.
              </p>
              <div className="mb-2 text-center">
                <span className="font-medium">Service Fee:</span>
                <span className="ml-2 text-doc-deep-blue">{serviceFee} USDC</span>
              </div>
              <div className="mb-2 text-center">
                <span className="font-medium">File size tier:</span>
                <span className="ml-2 text-doc-deep-blue">{fileSizeTier}</span>
              </div>
              <div className="text-xs text-doc-medium-gray mt-1 text-center">
                Only the sender and recipient will be able to access and decrypt this file.
              </div>
            </div>
          )}
          {/* Uploading and upload complete states */}
          {uploading && (
            <div className="mt-4 flex flex-col items-center">
              <div className="text-2xl font-bold text-gray-900 dark:text-white text-center mb-2">Encrypting & uploading...</div>
              {/* Progress bar and percentage removed as per requirements */}
            </div>
          )}
          {uploadComplete && !uploading && !uploadError && (
            <div className="mt-6 flex flex-col items-center animate-fade-in">
              <div className="mb-4">
                <svg width="64" height="64" fill="none" viewBox="0 0 64 64">
                  <circle cx="32" cy="32" r="32" fill="#22c55e" opacity="0.15"/>
                  <circle cx="32" cy="32" r="24" fill="#22c55e"/>
                  <path d="M22 34l8 8 12-14" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="text-green-700 dark:text-green-400 text-lg font-semibold mb-2">Upload Complete!</div>
              <div className="text-doc-medium-gray text-center mb-2">
                Your file has been uploaded to Arweave.<br/>
                <span className="text-blue-700 dark:text-blue-300 font-medium">It may take a few minutes to appear in your Sent tab as it is confirmed on the Arweave network.</span>
              </div>
              <button
                className="mt-4 px-6 py-2 rounded bg-blue-600 text-white font-bold hover:bg-blue-700 transition-colors"
                onClick={() => { setShowPaymentDialog(false); setUploadComplete(false); }}
              >
                Close
              </button>
            </div>
          )}
          {uploadError && <div className="mt-4 text-red-600">{uploadError}</div>}
          {/* Payment section only if not uploading or upload complete */}
          {!uploading && !uploadComplete && (
            <>
              {showPaymentDialog && (
                <Checkout
                  chargeHandler={chargeHandler}
                  onStatus={(status) => {
                    const { statusName } = status;
                    if (statusName === 'success') {
                      setPaymentStatus('success');
                      setPaymentError(null);
                      setShowPaymentDialog(false);
                      handlePostPaymentUpload();
                    } else if (statusName === 'error') {
                      setPaymentStatus('error');
                      setPaymentError('Payment failed');
                    } else if (statusName === 'pending') {
                      setPaymentStatus('processing');
                    } else if (statusName === 'init' || statusName === 'fetchingData' || statusName === 'ready') {
                      setPaymentStatus('processing');
                    }
                  }}
                >
                  <CheckoutButton coinbaseBranded className="w-full py-3 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 transition-colors mb-2" />
                  <CheckoutStatus />
                </Checkout>
              )}
              {paymentStatus === 'error' as typeof paymentStatus && (
                <div className="text-red-600 flex flex-col">
                  Payment failed: {paymentError}
                  <button onClick={retryPayment} className="underline text-blue-600 mt-1">Retry Payment</button>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
      {/* Upload Notification Bell */}
      <UploadNotification visible={uploadComplete && !uploading && !uploadError} />
    </div>
  );
};

// --- Upload Notification Component ---
import React from 'react';

const UploadNotification = ({ visible }: { visible: boolean }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  if (!visible) return null;
  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex items-center justify-center w-14 h-14 rounded-full bg-blue-600 text-white shadow-lg animate-fade-in cursor-pointer"
      onClick={() => setShowTooltip((v) => !v)}
      title="File upload complete">
      <Bell size={28} />
      {showTooltip && (
        <div className="absolute bottom-16 right-0 bg-white text-blue-800 rounded shadow-lg px-4 py-2 text-sm font-semibold">
          File upload complete!
        </div>
      )}
    </div>
  );
};

export default Send;
