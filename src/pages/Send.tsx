import { useState, useEffect, useCallback } from 'react';
import { FileUp, Send as SendIcon, User, Users, X, AlertCircle, Coins, Clock, Bell } from 'lucide-react';
import { toast } from "sonner";
import Header from "@/components/Header";
import { arweaveService, FileMetadata } from "@/lib/arweave-service";
import { encryptFileBufferHKDF } from '@/lib/encryption';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useAccount } from 'wagmi';
import { Checkout, CheckoutButton, CheckoutStatus } from '@coinbase/onchainkit/checkout';

// Define the SentFileInfo interface
interface SentFileInfo {
  id: string;
  name: string;
  size: number;
  type: string;
  recipient: string;
  recipientAddress: string;
  txId: string;
  timestamp: number;
  encryptionKey: string;
}

const Send = () => {
  // ...existing state declarations...
  const [uploadTimeoutId, setUploadTimeoutId] = useState<NodeJS.Timeout | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [recipients, setRecipients] = useState<{name: string; address: string}[]>([{name: "", address: ""}]);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [calculatedFee, setCalculatedFee] = useState<string | null>(null);
  const [fileSizeTier, setFileSizeTier] = useState<string | null>(null);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showProgressDialog, setShowProgressDialog] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
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
  const [sentFiles, setSentFiles] = useState<SentFileInfo[]>([]);
  const [uploadComplete, setUploadComplete] = useState(false);

  // Charge handler for Coinbase Commerce is defined below in the file

  // Free tier usage tracking
  const [freeTierUsage, setFreeTierUsage] = useState<number>(() => {
    const stored = localStorage.getItem('freeTierUsage');
    return stored ? parseInt(stored, 10) : 0;
  });
  const [lastFreeTierReset, setLastFreeTierReset] = useState<number>(() => {
    const stored = localStorage.getItem('lastFreeTierReset');
    return stored ? parseInt(stored, 10) : Date.now();
  });

  // Get sender address from wallet
  const { address: senderAddress, isConnected } = useAccount();
  
  // Optional: Add an effect to log connection status changes
  useEffect(() => {
    if (isConnected) {
      console.log('Wallet connected:', senderAddress);
    } else {
      console.log('Wallet disconnected');
    }
  }, [isConnected, senderAddress]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      setFiles(prevFiles => [...prevFiles, ...newFiles]);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prevFiles => prevFiles.filter((_, i) => i !== index));
  };
  
  // Calculate total size of all files in bytes
  const getTotalFileSize = useCallback((): number => {
    return files.reduce((total, file) => total + file.size, 0);
  }, [files]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (files.length === 0) {
      toast.error("Please select at least one file to send");
      return;
    }
    
    // Validate recipients
    const validRecipients = recipients.filter(r => r.name && r.address);
    if (validRecipients.length === 0) {
      toast.error("Please enter at least one recipient with name and wallet address");
      return;
    }
    
    // Check if any recipient is missing information
    const incompleteRecipients = recipients.filter(r => r.name && !r.address || !r.name && r.address);
    if (incompleteRecipients.length > 0) {
      toast.error("Some recipients have incomplete information. Please provide both name and wallet address.");
      return;
    }
    
    try {
      // Start sending process
      setSending(true);
      
      // Generate a unique document group ID for this batch
      const batchId = `batch_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      
      // Calculate total size and prepare document IDs
      const totalSize = getTotalFileSize();
      const fileDocIds = files.map(() => `doc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`);
      
      // Store document IDs for the batch
      setDocumentId(fileDocIds[0]); // Store the first doc ID for payment processing
      
      // Show payment confirmation
      setShowPaymentDialog(true);
      // Do NOT call handlePostPaymentUpload here!
      setSending(false);
    } catch (error) {
      console.error("Error preparing documents:", error);
      toast.error("Failed to prepare documents for sending");
      setSending(false);
    }
  };

  // State for Arweave pricing data
  const [arweavePricing, setArweavePricing] = useState<{
    arPrice: number;
    pricePerMBInAR: number;
    pricePerMBInUSD: number;
    timestamp: number;
    networkFactor: number;
  } | null>(null);
  const [isLoadingArweavePricing, setIsLoadingArweavePricing] = useState(false);
  const [arweavePricingError, setArweavePricingError] = useState<string | null>(null);

  // Fetch Arweave pricing data
  const fetchArweavePricing = useCallback(async () => {
    try {
      setIsLoadingArweavePricing(true);
      setArweavePricingError(null);
      const response = await fetch('/api/getArweavePrice');
      if (!response.ok) {
        throw new Error('Failed to fetch Arweave pricing');
      }
      const data = await response.json();
      setArweavePricing(data);
      return data;
    } catch (error) {
      console.error('Error fetching Arweave pricing:', error);
      setArweavePricingError(error instanceof Error ? error.message : 'Unknown error');
      return null;
    } finally {
      setIsLoadingArweavePricing(false);
    }
  }, []);

  // Calculate dynamic pricing based on Arweave token price and network conditions
  const calculateDynamicPrice = useCallback((sizeMB: number, pricingData: any) => {
    if (!pricingData) return null;
    
    // Base cost calculation using Arweave pricing
    const baseCostInUSD = sizeMB * pricingData.pricePerMBInUSD;
    
    // Apply network factor (represents network congestion, etc.)
    const adjustedCostInUSD = baseCostInUSD * pricingData.networkFactor;
    
    // Add service fee margin (50% markup for service)
    const totalCostWithMargin = adjustedCostInUSD * 1.5;
    
    // Round to nearest 0.5 USD for simplicity
    return (Math.ceil(totalCostWithMargin * 2) / 2).toFixed(2);
  }, []);

  useEffect(() => {
    if (files.length > 0) {
      let tier = null;
      let fee = null;
      const totalSizeMB = getTotalFileSize() / 1024 / 1024;
      
      // Pricing tiers
      if (totalSizeMB < 0.1) {
        tier = 'Tier 1 (<100KB)';
        fee = '0.05';
      } else if (totalSizeMB < 10) {
        tier = 'Tier 2 (100KB-10MB)';
        fee = '0.5';
      } else if (totalSizeMB < 20) {
        tier = 'Tier 3 (10MB-20MB)';
        fee = '1.00';
      } else if (totalSizeMB >= 20) {
        // For files over 20MB, use dynamic pricing based on Arweave
        if (totalSizeMB < 50) {
          tier = 'Tier 4 (20-50MB) - Dynamic';
        } else if (totalSizeMB < 100) {
          tier = 'Tier 5 (50-100MB) - Dynamic';
        } else {
          tier = 'Tier 6 (>100MB) - Dynamic';
        }
        
        // If we already have pricing data, use it immediately
        if (arweavePricing && arweavePricing.timestamp > Date.now() - 3600000) { // Cache for 1 hour
          const dynamicFee = calculateDynamicPrice(totalSizeMB, arweavePricing);
          if (dynamicFee) {
            fee = dynamicFee;
          } else {
            // Fallback to static pricing if calculation fails
            if (totalSizeMB < 50) fee = '2.00';
            else if (totalSizeMB < 100) fee = '3.00';
            else fee = '5.00';
          }
        } else {
          // Set initial static fee while fetching real-time data
          if (totalSizeMB < 50) fee = '2.00';
          else if (totalSizeMB < 100) fee = '3.00';
          else fee = '5.00';
          
          // Fetch fresh pricing data
          fetchArweavePricing().then(pricingData => {
            if (pricingData) {
              const dynamicFee = calculateDynamicPrice(totalSizeMB, pricingData);
              if (dynamicFee) {
                setServiceFee(dynamicFee);
              }
            }
          });
        }
      }
      
      setFileSizeTier(tier);
      setServiceFee(fee);
    } else {
      setFileSizeTier(null);
      setServiceFee('0.00');
    }
  }, [files, arweavePricing, calculateDynamicPrice, fetchArweavePricing]);
  
  // Fetch Arweave pricing on component mount
  useEffect(() => {
    fetchArweavePricing();
    
    // Refresh pricing every hour
    const intervalId = setInterval(() => {
      fetchArweavePricing();
    }, 3600000); // 1 hour
    
    return () => clearInterval(intervalId);
  }, [fetchArweavePricing]);

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
  const chargeHandler = useCallback(async (): Promise<string> => {
    try {
      // Validate inputs
      if (!senderAddress) {
        throw new Error('Wallet not connected. Please connect your wallet to proceed with payment.');
      }

      if (files.length === 0) {
        throw new Error('No files selected for upload');
      }

      // Validate recipients
      const validRecipients = recipients
        .filter(r => {
          // Ensure both name and address are provided and not just whitespace
          const hasValidName = r.name && r.name.trim().length > 0;
          const hasValidAddress = r.address && r.address.trim().length > 0;
          return hasValidName && hasValidAddress;
        })
        .map(r => r.address);
      
      if (validRecipients.length === 0) {
        throw new Error('Please provide at least one valid recipient with both name and wallet address');
      }

      // Validate service fee
      if (isNaN(serviceFee) || serviceFee <= 0) {
        throw new Error('Invalid service fee amount');
      }

      // Update UI state
      setPaymentStatus('processing');
      setPaymentError(null);
      
      console.log('Initiating payment with:', {
        amount: serviceFee,
        currency: paymentCurrency,
        fileCount: files.length,
        recipientCount: validRecipients.length,
        sender: senderAddress
      });

      try {
        // Call backend to create charge with correct amount
        const response = await fetch('/api/createCharge', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'X-Request-ID': documentId // Add request ID for tracking
          },
          body: JSON.stringify({
            amount: serviceFee,
            currency: paymentCurrency,
            name: 'Tuma File Upload',
            description: `Payment for uploading ${files.length} file(s) to Arweave`,
            metadata: { 
              sender: senderAddress, 
              recipients: validRecipients, 
              documentId,
              fileCount: files.length,
              totalSize: getTotalFileSize(),
              timestamp: new Date().toISOString()
            }
          })
        });

        // Check for HTTP errors
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          console.error('Charge creation failed:', {
            status: response.status,
            statusText: response.statusText,
            error: errorData
          });
          throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        // Validate response data
        if (!data || !data.success || !data.data || !data.data.id) {
          console.error('Invalid response from payment service:', data);
          throw new Error('Invalid response from payment service');
        }

        console.log('Charge created successfully:', data.data.id);
        
        // Store charge ID for polling and return it for the Checkout component
        setChargeId(data.data.id);
        setPaymentStatus('pending');
        
        return data.data.id;
        
      } catch (error) {
        console.error('Error during charge creation:', error);
        throw new Error(`Failed to create payment: ${error.message}`);
      }
      
    } catch (error: any) {
      console.error('Payment error:', error);
      const errorMessage = error.message || 'Failed to process payment';
      setPaymentStatus('error');
      setPaymentError(errorMessage);
      throw new Error(errorMessage);
    }
  }, [
    senderAddress, 
    recipients, 
    serviceFee, 
    paymentCurrency, 
    documentId, 
    files.length, 
    getTotalFileSize
  ]);

  const retryPayment = () => {
    setShowPaymentDialog(true);
    setPaymentStatus('idle');
    setPaymentError(null);
  };

  const handlePostPaymentUpload = async () => {
    // Validate inputs
    if (files.length === 0) {
      setUploadError('No files selected for upload');
      return;
    }
    
    if (!documentId) {
      setUploadError('Missing document ID');
      return;
    }
    
    if (!senderAddress) {
      setUploadError('Wallet not connected');
      return;
    }
    
    try {
      setSending(true);
      setShowPaymentDialog(false);
      setUploadProgress(0);
      setShowProgressDialog(true);
      setUploading(true);
      setUploadError(null);
      setUploadComplete(false);
      
      // Track successful uploads
      const successfulUploads: SentFileInfo[] = [];
      const totalFiles = files.length * recipients.filter(r => r.name && r.address).length;
      let completedUploads = 0;
      
      // Process each file for each recipient
      const validRecipients = recipients.filter(r => r.name && r.name.trim() && r.address && r.address.trim());
      
      if (validRecipients.length === 0) {
        throw new Error('No valid recipients provided');
      }
      
      // Show progress dialog with initial state
      setShowProgressDialog(true);
      setUploading(true);
      setUploadError(null);
      setUploadComplete(false);
      
      console.log(`Starting upload of ${files.length} files to ${validRecipients.length} recipients`);
      
      for (const recipient of validRecipients) {
        console.log(`Processing recipient: ${recipient.name} (${recipient.address})`);
        
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const fileDocId = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
          
          try {
            // Generate encryption key
            const encryptionKey = generateEncryptionKey();
            
            // Encrypt file
            const buffer = await file.arrayBuffer();
            const { ciphertext, iv } = await encryptFileBufferHKDF(
              buffer, 
              senderAddress?.toLowerCase() || '', 
              recipient.address.toLowerCase(), 
              fileDocId
            );
            
            // Create hash
            const hashBuffer = await crypto.subtle.digest('SHA-256', Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0)));
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const sha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            
            // Create metadata
            const metadata: FileMetadata = {
              name: file.name,
              type: file.type,
              size: file.size,
              sender: senderAddress?.toLowerCase() || '',
              recipient: recipient.address.toLowerCase(),
              timestamp: Date.now(),
              description: message || undefined,
              iv,
              sha256,
              chargeId: chargeId || undefined,
              documentId: fileDocId,
            };
            
            // Convert ciphertext to Uint8Array
            let cipherArr;
            if (typeof ciphertext === 'string') {
              try {
                cipherArr = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
              } catch (e) {
                throw new Error('Failed to convert ciphertext to Uint8Array');
              }
            } else {
              throw new Error('Invalid ciphertext type');
            }
            
            // Upload to Arweave
            const txId = await arweaveService.uploadFileToArweave(
              cipherArr,
              metadata,
              (progress) => {
                // Calculate overall progress across all files
                const fileProgress = progress / totalFiles;
                const baseProgress = (completedUploads / totalFiles) * 100;
                setUploadProgress(baseProgress + fileProgress);
              }
            );
            
            if (!txId) {
              throw new Error(`Failed to upload file ${file.name} to Arweave`);
            }
            
            // Store the transaction information
            const fileInfo: SentFileInfo = {
              id: fileDocId,
              name: file.name,
              size: file.size,
              type: file.type,
              recipient: recipient.name,
              recipientAddress: recipient.address,
              txId: txId,
              timestamp: Date.now(),
              encryptionKey: encryptionKey,
            };
            
            successfulUploads.push(fileInfo);
            completedUploads++;
            
          } catch (error) {
            console.error(`Error uploading file ${file.name} to recipient ${recipient.name}:`, error);
            toast.error(`Failed to upload ${file.name} to ${recipient.name}. Continuing with other files...`);
            // Continue with other files
          }
        }
        
        // Add to recent recipients if not already there
        if (!recentRecipients.some(r => r.address === recipient.address)) {
          const updatedRecipients = [
            { name: recipient.name, address: recipient.address, lastSent: Date.now() },
            ...recentRecipients
          ].slice(0, 5); // Keep only the 5 most recent
          setRecentRecipients(updatedRecipients);
          localStorage.setItem('recentRecipients', JSON.stringify(updatedRecipients));
        }
      }
      
      // Add all successful uploads to sent files
      if (successfulUploads.length > 0) {
        const updatedSentFiles = [...sentFiles, ...successfulUploads];
        setSentFiles(updatedSentFiles);
        localStorage.setItem('sentFiles', JSON.stringify(updatedSentFiles));
        
        // Success!
        setShowProgressDialog(false);
        setShowSuccessDialog(true);
        setUploadComplete(true);
        
        // Reset form
        setFiles([]);
        setMessage("");
        setRecipients([{ name: "", address: "" }]);
      } else {
        setShowProgressDialog(false);
        toast.error("Failed to upload any files. Please try again.");
      }
      
    } catch (error) {
      console.error("Error in upload process:", error);
      setShowProgressDialog(false);
      setUploadError(error instanceof Error ? error.message : 'Unknown error');
      toast.error("An unexpected error occurred during the upload process. Please try again.");
    } finally {
      setSending(false);
      setUploading(false);
    }
  };
  // State for recent recipients
  const [recentRecipients, setRecentRecipients] = useState<{ name: string; address: string; lastSent?: number }[]>([]);
  const [isLoadingRecipients, setIsLoadingRecipients] = useState(false);

  // --- Recent Recipients: Local Storage Logic ---
  const RECENT_RECIPIENTS_KEY = 'recentRecipients';

  function saveRecentRecipient(recipient: { name: string; address: string }) {
    let existing: { name: string; address: string; lastSent?: number }[] = [];
    try {
      const raw = localStorage.getItem(RECENT_RECIPIENTS_KEY) || '[]';
      existing = JSON.parse(raw);
    } catch (err) {
      console.error('Error parsing RECENT_RECIPIENTS_KEY:', err);
      existing = [];
    }
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

  // Generate a random encryption key for file encryption
  const generateEncryptionKey = (): string => {
    const array = new Uint8Array(32); // 256 bits
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  };

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
                    Select Files
                  </label>
                  <label htmlFor="file" tabIndex={0}
                    className="group transition-all duration-200 border-2 border-dashed border-doc-pale-gray dark:border-gray-600 rounded-xl p-12 text-center bg-white dark:bg-gray-800 hover:shadow-2xl hover:scale-103 hover:bg-blue-50/60 dark:hover:bg-blue-900/40 cursor-pointer ease-in-out flex flex-col items-center justify-center focus-within:shadow-2xl focus-within:scale-103"
                  >
                    <FileUp className="mx-auto h-14 w-14 text-doc-medium-gray mb-4 transition-all duration-200 group-hover:text-doc-deep-blue" />
                    <p className="text-doc-medium-gray mb-6 text-lg font-medium group-hover:text-doc-deep-blue">
                      Drag and drop files, or click to select
                    </p>
                    <input
                      type="file"
                      id="file"
                      accept="*/*"
                      onChange={handleFileChange}
                      className="hidden"
                      tabIndex={-1}
                      multiple
                    />
                  </label>
                  
                  {files.length > 0 && (
                    <div className="mt-4">
                      <div className="flex justify-between items-center mb-2">
                        <h3 className="text-sm font-medium">Selected Files ({files.length})</h3>
                        <p className="text-xs text-doc-medium-gray">
                          Total size: {(getTotalFileSize() / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {files.map((file, index) => (
                          <div key={index} className="flex items-center p-3 bg-doc-soft-blue dark:bg-blue-900/30 rounded-lg animate-scale-in">
                            <div className="mr-3">
                              <div className="w-10 h-10 rounded-lg bg-white dark:bg-gray-700 flex items-center justify-center">
                                <FileUp size={20} className="text-doc-deep-blue" />
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{file.name}</p>
                              <p className="text-xs text-doc-medium-gray">
                                {(file.size / 1024 / 1024).toFixed(2)} MB
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeFile(index)}
                              className="p-1.5 rounded-full hover:bg-white dark:hover:bg-gray-700 transition-colors text-doc-medium-gray"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                  <div className="mb-8">
                    <div className="flex justify-between items-center mb-3">
                      <label className="block text-sm font-medium">
                        Recipients
                      </label>
                      <span className="text-xs text-doc-medium-gray">
                        {recipients.length} of 5 added
                      </span>
                    </div>
                    
                    {/* Recipient Chips */}
                    <div className="flex flex-wrap gap-2 mb-3 min-h-[44px] items-start">
                      {recipients.map((recipient, index) => (
                        <div 
                          key={index}
                          className="inline-flex items-center bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200 rounded-full py-1.5 pl-3 pr-2 text-sm font-medium transition-all duration-200 hover:bg-blue-100 dark:hover:bg-blue-800/40"
                        >
                          <span className="mr-2">
                            {recipient.name || 'Unnamed'}
                            {recipient.address && (
                              <span className="ml-1 text-blue-500 dark:text-blue-300">
                                • {recipient.address.substring(0, 6)}...{recipient.address.slice(-4)}
                              </span>
                            )}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              setRecipients(recipients.filter((_, i) => i !== index));
                            }}
                            className="ml-1 p-0.5 rounded-full hover:bg-blue-200 dark:hover:bg-blue-700/50 transition-colors"
                            aria-label="Remove recipient"
                          >
                            <X size={14} className="text-blue-500 dark:text-blue-300" />
                          </button>
                        </div>
                      ))}
                      
                      {recipients.length < 5 && (
                        <button
                          type="button"
                          onClick={() => setRecipients([...recipients, {name: "", address: ""}])}
                          className="inline-flex items-center text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm font-medium transition-colors group"
                        >
                          <span className="inline-flex items-center justify-center w-6 h-6 mr-1 bg-blue-100 dark:bg-blue-900/40 rounded-full group-hover:bg-blue-200 dark:group-hover:bg-blue-800/60 transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500 dark:text-blue-400">
                              <line x1="12" y1="5" x2="12" y2="19"></line>
                              <line x1="5" y1="12" x2="19" y2="12"></line>
                            </svg>
                          </span>
                          Add recipient
                        </button>
                      )}
                    </div>
                    
                    {/* Recipient Form */}
                    {recipients.length > 0 && (
                      <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 transition-all duration-200">
                        <div className="mb-4">
                          <label 
                            htmlFor="recipient-name"
                            className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5"
                          >
                            Recipient Name
                          </label>
                          <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                              <User size={16} className="text-gray-400" />
                            </div>
                            <input
                              type="text"
                              id="recipient-name"
                              placeholder="Enter name or organization"
                              className="pl-10 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none py-2.5 text-gray-900 dark:text-white text-sm transition-all duration-200"
                              value={recipients[0]?.name || ''}
                              onChange={(e) => {
                                const newRecipients = [...recipients];
                                newRecipients[0].name = e.target.value;
                                setRecipients(newRecipients);
                              }}
                            />
                          </div>
                        </div>
                        
                        <div>
                          <label 
                            htmlFor="recipient-address"
                            className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5"
                          >
                            Wallet Address
                          </label>
                          <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
                                <rect x="2" y="6" width="20" height="12" rx="2" />
                                <path d="M22 10H2" />
                              </svg>
                            </div>
                            <input
                              type="text"
                              id="recipient-address"
                              placeholder="0x... or arweave:..."
                              className="pl-10 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none py-2.5 text-gray-900 dark:text-white text-sm font-mono transition-all duration-200"
                              value={recipients[0]?.address || ''}
                              onChange={(e) => {
                                const newRecipients = [...recipients];
                                newRecipients[0].address = e.target.value;
                                setRecipients(newRecipients);
                              }}
                            />
                          </div>
                        </div>
                        
                        {/* Recent Recipients */}
                        {recentRecipients.length > 0 && (
                          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                            <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                              Recent Recipients
                            </h4>
                            <div className="flex flex-wrap gap-2">
                              {recentRecipients.slice(0, 3).map((recent, i) => (
                                <button
                                  key={i}
                                  type="button"
                                  onClick={() => {
                                    const newRecipients = [...recipients];
                                    newRecipients[0] = {
                                      name: recent.name,
                                      address: recent.address
                                    };
                                    setRecipients(newRecipients);
                                  }}
                                  className="inline-flex items-center text-xs px-3 py-1.5 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-600/50 rounded-full transition-colors text-gray-700 dark:text-gray-200"
                                >
                                  <span className="w-2 h-2 rounded-full bg-green-400 mr-2"></span>
                                  {recent.name}
                                  <span className="ml-1.5 text-gray-400 dark:text-gray-400 font-mono">
                                    {recent.address.substring(0, 4)}...{recent.address.slice(-4)}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
                      Each recipient will receive all selected files. Maximum 5 recipients.
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
                        // Update the first recipient in the list with the selected recipient
                        const updatedRecipients = [...recipients];
                        updatedRecipients[0] = {
                          name: recipient.name,
                          address: recipient.address
                        };
                        setRecipients(updatedRecipients);
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
                  <span className="text-doc-medium-gray">Tier 1 (&lt;100KB):</span>
                  <span className="font-medium">0.05 USDC</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-doc-medium-gray">Tier 2 (100KB-10MB):</span>
                  <span className="font-medium">0.50 USDC</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-doc-medium-gray">Tier 3 (10-20MB):</span>
                  <span className="font-medium">1.00 USDC</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-doc-medium-gray">Tier 4 (20-50MB):</span>
                  <span className="font-medium">2.00 USDC</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-doc-medium-gray">Tier 5 (50-100MB):</span>
                  <span className="font-medium">3.00 USDC</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-doc-medium-gray">Tier 6 (&gt;100MB):</span>
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
              setFiles([]);
              setRecipients([{name: "", address: ""}]);
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
          aria-describedby="payment-dialog-desc"
        >
          <div id="payment-dialog-desc" style={{ display: 'none' }}>
            To send this file securely, a service fee is required. The platform will cover Arweave storage costs. Only the sender and recipient will be able to access and decrypt this file.
          </div>
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
                To send these files securely, a service fee is required. The platform will cover Arweave storage costs.
              </p>
              <div className="mb-2 text-center">
                <span className="font-medium">Service Fee:</span>
                <span className="ml-2 text-doc-deep-blue">{serviceFee} USDC</span>
              </div>
              <div className="mb-2 text-center">
                <span className="font-medium">File size tier:</span>
                <span className="ml-2 text-doc-deep-blue">{fileSizeTier}</span>
              </div>
              <div className="mb-2 text-center">
                <span className="font-medium">Files:</span>
                <span className="ml-2 text-doc-deep-blue">{files.length}</span>
              </div>
              <div className="mb-2 text-center">
                <span className="font-medium">Recipients:</span>
                <span className="ml-2 text-doc-deep-blue">{recipients.filter(r => r.name && r.address).length}</span>
              </div>
              <div className="text-xs text-doc-medium-gray mt-1 text-center">
                Only the sender and recipients will be able to access and decrypt these files.
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
                <p className="mb-2">
                  <span className="font-medium">{sentFiles.length}</span> files have been uploaded to Arweave
                  for <span className="font-medium">{Array.from(new Set(sentFiles.map(f => f.recipientAddress))).length}</span> recipients.
                </p>
                <span className="text-blue-700 dark:text-blue-300 font-medium">It may take a few minutes for files to appear in your Sent tab as they are confirmed on the Arweave network.</span>
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
                <div className="w-full">
                  <Checkout
                    chargeHandler={async () => {
                      try {
                        console.log('Initiating payment...');
                        const chargeId = await chargeHandler();
                        console.log('Payment initiated with charge ID:', chargeId);
                        return chargeId;
                      } catch (error) {
                        console.error('Error in chargeHandler:', error);
                        throw error;
                      }
                    }}
                    onStatus={(status: { statusName: string; statusData?: any }) => {
                      console.log('Payment status update:', status);
                      const { statusName, statusData } = status;
                      
                      try {
                        if (statusName === 'success') {
                          console.log('Payment successful, starting upload...');
                          setPaymentStatus('success');
                          setPaymentError(null);
                          setShowPaymentDialog(false);
                          handlePostPaymentUpload().catch(err => {
                            console.error('Error in post-payment upload:', err);
                            setUploadError('Upload failed after successful payment: ' + (err.message || 'Unknown error'));
                          });
                        } else if (statusName === 'error') {
                          console.error('Payment error:', status);
                          setPaymentStatus('error');
                          setPaymentError(
                            (statusData as { message?: string })?.message || 
                            'Payment failed. Please try again.'
                          );
                        } else if (statusName === 'pending') {
                          console.log('Payment pending...');
                          setPaymentStatus('processing');
                        } else if (['init', 'fetchingData', 'ready'].includes(statusName)) {
                          console.log('Payment processing...');
                          setPaymentStatus('processing');
                        }
                      } catch (error) {
                        console.error('Error in payment status handler:', error);
                        setPaymentStatus('error');
                        setPaymentError('An unexpected error occurred');
                      }
                    }}
                  >
                    <CheckoutButton 
                      coinbaseBranded 
                      className="w-full py-3 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 transition-colors mb-2"
                      disabled={!isConnected}
                    />
                    <CheckoutStatus />
                  </Checkout>
                  {!isConnected && (
                    <div className="text-red-500 text-sm mt-2 text-center">
                      Please connect your wallet to proceed with payment
                    </div>
                  )}
                </div>
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
