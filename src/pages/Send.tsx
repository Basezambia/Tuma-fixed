import { useState, useEffect, useCallback } from 'react';
import { FileUp, Send as SendIcon, User, Users, X, AlertCircle, Coins, Clock, Bell, Plus } from 'lucide-react';
import { toast } from "sonner";
import Header from "@/components/Header";
import { arweaveService, FileMetadata } from "@/lib/arweave-service";
import { encryptFileBufferHKDF, encryptFileForMultipleRecipients, encryptMetadata } from '@/lib/encryption';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useAccount } from 'wagmi';
import { Checkout, CheckoutButton, CheckoutStatus } from '@coinbase/onchainkit/checkout';
import { getAddress } from '@coinbase/onchainkit/identity';
import { base } from 'wagmi/chains';

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
  const [recipients, setRecipients] = useState<{name: string; address: string; originalInput?: string}[]>([]);
  const [currentRecipient, setCurrentRecipient] = useState<{name: string; address: string; originalInput?: string}>({name: "", address: ""});
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [processStep, setProcessStep] = useState<'idle' | 'encrypting' | 'uploading' | 'pending' | 'success'>('idle');
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
  const [isResolvingName, setIsResolvingName] = useState(false);

  // Function to resolve ENS/Base names to addresses
  const resolveNameToAddress = async (name: string): Promise<string | null> => {
    try {
      setIsResolvingName(true);
      const address = await getAddress({ name, chain: base });
      return address || null;
    } catch (error) {
      console.error('Error resolving name:', error);
      return null;
    } finally {
      setIsResolvingName(false);
    }
  };

  // Function to handle address input with name resolution
  const handleAddressChange = async (value: string) => {
    // Check if the input looks like an ENS/Base name
    if (value.includes('.eth') || value.includes('.base.eth')) {
      // For ENS/Base names, don't set the address until we resolve it
      setCurrentRecipient({...currentRecipient, address: value, originalInput: value}); // Show the name while resolving
      const resolvedAddress = await resolveNameToAddress(value);
      if (resolvedAddress) {
        setCurrentRecipient({...currentRecipient, address: resolvedAddress, originalInput: value});
        toast.success(`Resolved ${value} to ${resolvedAddress.slice(0, 6)}...${resolvedAddress.slice(-4)}`);
      } else {
        toast.error(`Could not resolve ${value}. Please check the name or enter a direct address.`);
        // Keep the original name in case user wants to try again
        setCurrentRecipient({...currentRecipient, address: value, originalInput: value});
      }
    } else {
      // For regular addresses, set immediately
      setCurrentRecipient({...currentRecipient, address: value});
    }
  };
  const [showRecipientDialog, setShowRecipientDialog] = useState(false);
  const [showUploadSuccessPopup, setShowUploadSuccessPopup] = useState(false);


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
      const currentFileCount = files.length;
      const maxFiles = 8;
      const maxSizeBytes = 500 * 1024 * 1024; // 500MB in bytes
      
      // Check if adding new files would exceed the file count limit
      if (currentFileCount >= maxFiles) {
        toast.error(`Maximum of ${maxFiles} files allowed`);
        return;
      }
      
      // Only add files up to the limit
      const remainingSlots = maxFiles - currentFileCount;
      const filesToAdd = newFiles.slice(0, remainingSlots);
      
      // Check total size including new files
      const currentTotalSize = getTotalFileSize();
      const newFilesSize = filesToAdd.reduce((total, file) => total + file.size, 0);
      const totalSizeAfterAdd = currentTotalSize + newFilesSize;
      
      if (totalSizeAfterAdd > maxSizeBytes) {
        const remainingSize = maxSizeBytes - currentTotalSize;
        toast.error(`Total file size would exceed 500MB limit. You have ${(remainingSize / 1024 / 1024).toFixed(2)}MB remaining.`);
        return;
      }
      
      if (newFiles.length > remainingSlots) {
        toast.warning(`Only ${remainingSlots} more files can be added. Maximum of ${maxFiles} files allowed.`);
      }
      
      setFiles(prevFiles => [...prevFiles, ...filesToAdd]);
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
      // Generate a unique document group ID for this batch
      const batchId = `batch_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      
      // Calculate total size and prepare document IDs
      const totalSize = getTotalFileSize();
      const fileDocIds = files.map(() => `doc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`);
      
      // Store document IDs for the batch
      setDocumentId(fileDocIds[0]); // Store the first doc ID for payment processing
      
      // Show payment confirmation
      setShowPaymentDialog(true);
    } catch (error) {
      console.error("Error preparing documents:", error);
      toast.error("Failed to prepare documents for sending");
    }
  };

  // State for Arweave pricing data
  const [arweavePricing, setArweavePricing] = useState<{
    pricePerMBInAR: number;
    pricePerMBInUSD: number;
    pricePerMBInWinston: number;
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

  // Calculate dynamic pricing based on Arweave token price with 35% profit margin
  const calculateDynamicPrice = useCallback((sizeMB: number, pricingData: any) => {
    if (!pricingData) return null;
    
    // Base cost calculation using REAL Arweave pricing
    const baseCostInUSD = sizeMB * pricingData.pricePerMBInUSD;
    
    // Apply network factor (represents network congestion, etc.)
    const adjustedCostInUSD = baseCostInUSD * pricingData.networkFactor;
    
    // Add 35% profit margin as requested
    const totalCostWithMargin = adjustedCostInUSD * 1.35;
    
    // Ensure minimum fee of $0.01 for very small files
    const finalPrice = Math.max(0.01, totalCostWithMargin);
    
    return finalPrice.toFixed(2);
  }, []);

  // Calculate pricing for specific size tiers using real-time Arweave data
  const calculateTierPrice = useCallback((sizeMB: number) => {
    if (!arweavePricing) return 'Loading...';
    
    const dynamicPrice = calculateDynamicPrice(sizeMB, arweavePricing);
    return dynamicPrice ? `$${dynamicPrice} USDC` : 'Calculating...';
  }, [arweavePricing, calculateDynamicPrice]);

  useEffect(() => {
    if (files.length > 0) {
      let tier = null;
      let fee = null;
      const totalSizeMB = getTotalFileSize() / 1024 / 1024;
      
      // All pricing tiers now use dynamic real-time pricing with 35% profit margin
      if (totalSizeMB < 1) {
        tier = 'Below 1MB';
      } else if (totalSizeMB < 10) {
        tier = '1MB - 10MB';
      } else if (totalSizeMB < 30) {
        tier = '10MB - 30MB';
      } else if (totalSizeMB < 100) {
        tier = '30MB - 100MB';
      } else if (totalSizeMB <= 500) {
        tier = `${totalSizeMB.toFixed(0)}MB - Dynamic`;
      } else {
        // Over 500MB - not allowed
        tier = 'File too large';
        fee = '0.00';
        toast.error('Maximum file size is 500MB');
        setFileSizeTier(tier);
        setServiceFee(fee);
        return;
      }
      
      // Calculate dynamic pricing for all file sizes
      if (arweavePricing && arweavePricing.timestamp > Date.now() - 3600000) { // Cache for 1 hour
        const dynamicFee = calculateDynamicPrice(totalSizeMB, arweavePricing);
        if (dynamicFee) {
          fee = dynamicFee;
        } else {
          fee = '0.01'; // Minimum fallback
        }
      } else {
        // Set minimum fee while fetching real-time data
        fee = '0.01';
        
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
      const fee = Number(serviceFee);
      if (isNaN(fee) || fee <= 0) {
        throw new Error('Invalid service fee amount');
      }

      // Don't set processing state here - wait for actual payment to start
      setPaymentError(null);
      
      console.log('Initiating payment with:', {
        amount: serviceFee,
        currency: paymentCurrency,
        fileCount: files.length,
        recipientCount: validRecipients.length,
        sender: senderAddress
      });

      try {
        // Prepare the request body
        const requestBody = {
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
        };
        
        // Call backend to create charge with correct amount
        const response = await fetch('/api/createCharge', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'X-Request-ID': documentId // Add request ID for tracking
          },
          body: JSON.stringify(requestBody)
        });

        // Clone the response before reading it
        const responseClone = response.clone();
        
        try {
          // First try to parse as JSON
          const data = await response.json();
          
          // If we get here, the response was successful
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
          
        } catch (jsonError) {
          // If JSON parsing fails, handle as error response
          if (!response.ok) {
            let errorData;
            try {
              // Try to parse error response as JSON
              errorData = await responseClone.json();
            } catch (e) {
              // If JSON parsing fails, try to get text response
              try {
                const text = await responseClone.text();
                console.error('Failed to parse error response:', { 
                  status: response.status, 
                  statusText: response.statusText, 
                  text 
                });
                throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
              } catch (textError) {
                console.error('Failed to read error response:', textError);
                throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
              }
            }
            
            console.error('Charge creation failed:', {
              status: response.status,
              statusText: response.statusText,
              headers: Object.fromEntries(response.headers.entries()),
              error: errorData,
              request: {
                url: '/api/createCharge',
                method: 'POST',
                body: requestBody
              }
            });
            
            throw new Error(errorData?.message || `HTTP error! status: ${response.status}`);
          } else {
            // If response is ok but JSON parsing failed, it's a different error
            console.error('Failed to parse successful response:', jsonError);
            throw new Error('Invalid response format from payment service');
          }
        }
        
        // This code block should be removed as it's unreachable after the return statement above
        
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
    // Only allow retry if payment hasn't succeeded
    if (paymentStatus !== 'success') {
      setShowPaymentDialog(true);
      setPaymentStatus('idle');
      setPaymentError(null);
    }
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
      // Reset form after successful payment
      setFiles([]);
      setMessage("");
      setRecipients([]);
      setCurrentRecipient({ name: "", address: "", originalInput: "" });
      
      setShowPaymentDialog(false);
      setUploadProgress(0);
      setShowProgressDialog(true);
      setUploading(true);
      setUploadError(null);
      setUploadComplete(false);
      setProcessStep('encrypting');
      
      // Show encryption notification
      toast.info('Encrypting files...');
      
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
        
      }
      
      // Process each file once for all recipients
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileDocId = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        
        try {
          // Get all recipient addresses
          const recipientAddresses = validRecipients.map(r => r.address.toLowerCase());
          
          // Encrypt file for multiple recipients
          const buffer = await file.arrayBuffer();
          const { masterCiphertext, iv, recipientKeys } = await encryptFileForMultipleRecipients(
            buffer,
            senderAddress?.toLowerCase() || '',
            recipientAddresses,
            fileDocId
          );
          
          // Create hash of master ciphertext
          const hashBuffer = await crypto.subtle.digest('SHA-256', Uint8Array.from(atob(masterCiphertext), c => c.charCodeAt(0)));
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          const sha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
          
          // Create private metadata (encrypted)
          const privateMetadata = {
            name: file.name,
            type: file.type,
            size: file.size,
            sender: senderAddress?.toLowerCase() || '',
            recipients: validRecipients.map(r => ({
              name: r.name,
              address: r.address.toLowerCase()
            })),
            description: message || undefined,
            sha256,
            documentId: fileDocId,
            recipientKeys
          };
          
          // Encrypt private metadata for each recipient
          const encryptedMetadataForRecipients: { [address: string]: string } = {};
          for (const recipient of validRecipients) {
            encryptedMetadataForRecipients[recipient.address.toLowerCase()] = await encryptMetadata(
              privateMetadata,
              senderAddress?.toLowerCase() || '',
              recipient.address.toLowerCase(),
              fileDocId
            );
          }
          
          // Also encrypt for sender
          encryptedMetadataForRecipients[senderAddress?.toLowerCase() || ''] = await encryptMetadata(
            privateMetadata,
            senderAddress?.toLowerCase() || '',
            senderAddress?.toLowerCase() || '',
            fileDocId
          );
          
          // Combine master ciphertext with encrypted metadata
          const finalPayload = {
            ciphertext: masterCiphertext,
            iv,
            metadata: encryptedMetadataForRecipients
          };
          
          const payloadBytes = new TextEncoder().encode(JSON.stringify(finalPayload));
          
          // Create complete metadata object that matches FileMetadata interface
          const completeMetadata: FileMetadata = {
            name: file.name,
            type: file.type,
            size: file.size,
            sender: senderAddress?.toLowerCase() || '',
            recipient: validRecipients[0]?.address.toLowerCase() || '', // Keep for backward compatibility
            recipients: validRecipients.map(r => r.address.toLowerCase()), // Add recipients array
            timestamp: Date.now(),
            description: message || undefined,
            iv,
            sha256,
            documentId: fileDocId
          };
          
          // Create Arweave transaction tags
          const tags = [
            { name: 'App-Name', value: 'TUMA-Document-Exchange' },
            { name: 'Content-Type', value: 'application/octet-stream' },
            { name: 'Document-ID', value: fileDocId },
            { name: 'Sender', value: senderAddress?.toLowerCase() || '' },
            { name: 'Message', value: message || '' },
            { name: 'SHA256', value: sha256 },
            { name: 'Charge-ID', value: documentId },
            { name: 'Timestamp', value: Date.now().toString() },
          ];
          
          // Add recipient tags - store BOTH original input AND resolved address
          validRecipients.forEach((recipient, index) => {
            // Store the resolved address
            tags.push({ name: `Recipient-${index}`, value: recipient.address.toLowerCase() });
            
            // If the original input was an ENS/Base name, also store it
            if (recipient.originalInput && (recipient.originalInput.includes('.eth') || recipient.originalInput.includes('.base.eth'))) {
              tags.push({ name: `Recipient-Name-${index}`, value: recipient.originalInput.toLowerCase() });
            }
          });
          
          // Update process step and show uploading notification
          setProcessStep('uploading');
          toast.info('Uploading to Arweave...');
          
          // Upload to Arweave with complete metadata and tags
          const txId = await arweaveService.uploadFileToArweave(
            payloadBytes,
            completeMetadata, // Use completeMetadata instead of publicMetadata
            (progress) => {
              const fileProgress = progress / totalFiles;
              const baseProgress = (completedUploads / totalFiles) * 100;
              setUploadProgress(baseProgress + fileProgress);
            },
            tags // Pass the tags to the upload function
          );
          
          if (!txId) {
            throw new Error(`Failed to upload file ${file.name} to Arweave`);
          }
          
          // Store success info for all recipients
          for (const recipient of validRecipients) {
            successfulUploads.push({
              id: fileDocId,
              name: file.name,
              size: file.size,
              type: file.type,
              recipient: recipient.name,
              recipientAddress: recipient.address,
              txId: txId,
              timestamp: Date.now(),
              encryptionKey: generateEncryptionKey()
            });
          }
          
          completedUploads++;
          
        } catch (error) {
          console.error(`Failed to process file ${file.name}:`, error);
          throw error;
        }
      }
      
      // Process recent recipients after successful uploads
      for (const recipient of validRecipients) {
        
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
        
        // Dispatch tuma:newSentFile event for each successful upload for notifications
        successfulUploads.forEach(upload => {
          const event = new CustomEvent('tuma:newSentFile', {
            detail: {
              id: upload.id,
              metadata: {
                name: upload.name,
                sender: senderAddress?.toLowerCase() || '',
                recipient: upload.recipientAddress,
                timestamp: upload.timestamp,
                isVault: false
              }
            }
          });
          window.dispatchEvent(event);
        });
        
        // Success!
        setProcessStep('success');
        toast.success('Files uploaded successfully!');
        setShowProgressDialog(false);
        setShowSuccessDialog(true);
        setUploadComplete(true);
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
      setProcessStep('idle');
    }
  };

  // Process notification component
  const ProcessNotification = () => {
    if (processStep === 'idle') return null;
    
    const getStepInfo = () => {
      switch (processStep) {
        case 'encrypting':
          return { text: 'Encrypting files...', icon: '🔐' };
        case 'uploading':
          return { text: 'Uploading to Arweave...', icon: '⬆️' };
        case 'pending':
          return { text: 'Transaction pending...', icon: '⏳' };
        case 'success':
          return { text: 'Upload complete!', icon: '✅' };
        default:
          return { text: '', icon: '' };
      }
    };
    
    const { text, icon } = getStepInfo();
    
    return (
      <div className="fixed bottom-4 right-4 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg p-3 flex items-center gap-2 animate-fade-in">
        <span className="text-lg">{icon}</span>
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{text}</span>
        {processStep !== 'success' && (
          <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" />
        )}
      </div>
    );
  };
  // State for recent recipients
  const [recentRecipients, setRecentRecipients] = useState<{ name: string; address: string; lastSent?: number; originalInput?: string }[]>([]);
  const [isLoadingRecipients, setIsLoadingRecipients] = useState(false);
  const [showCompletionAnimation, setShowCompletionAnimation] = useState(false);

  // --- Recent Recipients: Local Storage Logic ---
  const RECENT_RECIPIENTS_KEY = 'recentRecipients';

  function saveRecentRecipient(recipient: { name: string; address: string; originalInput?: string }) {
    let existing: { name: string; address: string; lastSent?: number; originalInput?: string }[] = [];
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

  function loadRecentRecipients(): { name: string; address: string; lastSent?: number; originalInput?: string }[] {
    return JSON.parse(localStorage.getItem(RECENT_RECIPIENTS_KEY) || '[]');
  }

  // Add this useEffect to trigger the animation when 8 files are reached
  useEffect(() => {
    if (files.length === 8 && !showCompletionAnimation) {
      setShowCompletionAnimation(true);
      // Hide the animation and upload area after 2 seconds
      setTimeout(() => {
        setShowCompletionAnimation(false);
      }, 2000);
    }
  }, [files.length, showCompletionAnimation]);

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
        const recipientsFromSentFiles = files.reduce((acc: { name: string; address: string; lastSent?: number; originalInput?: string }[], file) => {
          const recipientAddress = file.metadata.recipient?.toLowerCase();
          if (!recipientAddress) return acc;
          
          // Skip if we already have this recipient in our accumulator
          if (acc.some(r => r.address.toLowerCase() === recipientAddress)) return acc;
          
          // Create a recipient entry - try to get the actual recipient name from tags
          let recipientName = 'Unknown';
          
          // First, try to find the recipient name from Recipient-Name-X tags
          const recipientNameTag = Object.keys(file.metadata)
            .find(key => key.startsWith('Recipient-Name-') && 
                  file.metadata[key]?.toLowerCase() === recipientAddress);
          
          if (recipientNameTag) {
            recipientName = file.metadata[recipientNameTag];
          } else {
            // Fallback: try to extract a meaningful name from the address
            if (recipientAddress.includes('.eth') || recipientAddress.includes('.base.eth')) {
              recipientName = recipientAddress;
            } else {
              // For wallet addresses, show a shortened version
              recipientName = `${recipientAddress.slice(0, 6)}...${recipientAddress.slice(-4)}`;
            }
          }
          
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

  // Get file type color based on file index (cycling through last 3 colors from the image)
  const getFileTypeColor = (fileName: string, fileSize: number, fileIndex?: number) => {
    // Use the last 3 colors from the second image: astro, Untit, PRO P (slate/blue tones)
    const colors = [
      'bg-slate-400',   // astro - lighter slate blue
      'bg-slate-600',   // Untit - medium slate blue
      'bg-slate-700'    // PRO P - darker slate blue
    ];
    
    // If fileIndex is provided, use it to cycle through colors
    // Otherwise, use a hash of the filename to ensure consistent coloring
    let colorIndex;
    if (fileIndex !== undefined) {
      colorIndex = fileIndex % colors.length;
    } else {
      // Create a simple hash from filename for consistent coloring
      let hash = 0;
      for (let i = 0; i < fileName.length; i++) {
        hash = ((hash << 5) - hash + fileName.charCodeAt(i)) & 0xffffffff;
      }
      colorIndex = Math.abs(hash) % colors.length;
    }
    
    return colors[colorIndex];
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
                  
                  {/* Show completion animation when 8 files reached */}
                  {showCompletionAnimation && (
                    <div className="border-2 border-gray-300 rounded-xl p-12 text-center bg-gray-50 dark:bg-gray-900/20">
                      <div className="mx-auto h-8 w-8 bg-gray-500 rounded-full flex items-center justify-center mb-4">
                        <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <p className="text-gray-600 dark:text-gray-400 mb-2 text-lg font-medium">
                        Upload Complete!
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Maximum files reached (8/8)
                      </p>
                    </div>
                  )}
                  
                  {/* Regular upload area - only show when less than 8 files and not showing animation */}
                  {files.length < 8 && !showCompletionAnimation && (
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
                  )}
                  
                  {files.length > 0 && (
                    <div className={files.length < 8 && !showCompletionAnimation ? "mt-6" : "mt-4"}>
                      <div className="flex justify-between items-center mb-3">
                        <h3 className="text-sm font-medium">Selected Files ({files.length}/8)</h3>
                        <p className="text-xs text-doc-medium-gray">
                          Total size: {(getTotalFileSize() / 1024 / 1024).toFixed(2)}/500 MB
                          {getTotalFileSize() > 400 * 1024 * 1024 && (
                            <span className="ml-2 text-orange-500 font-medium">
                              ⚠️ Approaching limit
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
                        <div className="flex items-center justify-start gap-6">
                          {files.map((file, index) => {
                            const fileExtension = file.name.split('.').pop()?.toUpperCase() || 'FILE';
                            const fileSizeMB = (file.size / 1024 / 1024).toFixed(2);
                            const colorGradient = getFileTypeColor(file.name, file.size, index);
                            
                            return (
                              <div key={index} className="flex flex-col items-center animate-scale-in">
                                <div className="relative group">
                                  <div className={`w-14 h-14 rounded-full ${colorGradient} dark:opacity-90 flex items-center justify-center text-white font-semibold text-xs hover:shadow-2xl hover:scale-105 transition-all duration-300 ring-2 ring-white/20`}>
                                    {fileExtension.substring(0, 3)}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => removeFile(index)}
                                    className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-red-600"
                                  >
                                    <X size={12} className="text-white" />
                                  </button>
                                </div>
                                <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                                  {fileSizeMB} MB
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="mb-8 mt-8">
                    <div className="flex justify-between items-center mb-3">
                      <label className="block text-sm font-medium">
                        Recipients
                      </label>
                      <span className="text-xs text-doc-medium-gray">
                        {recipients.length} of 5 added
                      </span>
                    </div>
                    
                    {/* Recipients Display */}
                    {recipients.length > 0 && (
                      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 mb-4">
                        <div className="flex items-center gap-2 overflow-x-auto">
                          {recipients.map((recipient, index) => {
                            const colors = [
                              'bg-slate-600',    // Dark blue-gray (lloyd's color)
                              'bg-gray-400'      // Light gray (lilly's color)
                            ];
                            const dotColor = colors[index % colors.length];
                            
                            return (
                              <div 
                                key={index}
                                className="inline-flex items-center bg-white dark:bg-gray-700 rounded-full py-1 pl-1 pr-2 text-sm transition-all duration-200 hover:shadow-md group whitespace-nowrap cursor-pointer"
                                onClick={() => {
                                  // Move recipient to edit form
                          setCurrentRecipient({
                            name: recipient.name,
                            address: recipient.address,
                            originalInput: recipient.originalInput
                          });
                                  // Remove from list
                                  setRecipients(recipients.filter((_, i) => i !== index));
                                  setShowRecipientDialog(true);
                                }}
                                title={`Click to edit ${recipient.name}`}
                              >
                                <div className={`w-5 h-5 rounded-full ${dotColor} mr-1.5 flex-shrink-0`}></div>
                                <span className="text-gray-700 dark:text-gray-300 font-medium text-xs">
                                  {recipient.name.length > 5 ? recipient.name.substring(0, 5) : recipient.name}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setRecipients(recipients.filter((_, i) => i !== index));
                                  }}
                                  className="ml-1.5 p-0.5 rounded-full opacity-0 group-hover:opacity-100 hover:bg-gray-200 dark:hover:bg-gray-600 transition-all duration-200"
                                  aria-label="Remove recipient"
                                >
                                  <X size={12} className="text-gray-500 dark:text-gray-400" />
                                </button>
                              </div>
                            );
                          })}
                          {/* Dark Gray Plus Button - Only show if less than 5 recipients */}
                          {recipients.length < 5 && (
                            <button
                              type="button"
                              onClick={() => {
                                setCurrentRecipient({name: "", address: "", originalInput: ""});
                                setShowRecipientDialog(true);
                              }}
                              className="inline-flex items-center justify-center w-8 h-8 bg-gray-600 hover:bg-gray-700 rounded-full transition-all duration-200 hover:shadow-md"
                              title="Add recipient"
                            >
                              <Plus size={14} className="text-white" />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {/* Recipient Form - Only show if no recipients added */}
                    {recipients.length === 0 && (
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
                              value={currentRecipient.name}
                              onChange={(e) => setCurrentRecipient({...currentRecipient, name: e.target.value})}
                              onKeyPress={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  if (currentRecipient.name && currentRecipient.address) {
                                    setRecipients([...recipients, currentRecipient]);
                                    setCurrentRecipient({name: "", address: "", originalInput: ""});
                                    saveRecentRecipient(currentRecipient);
                                  }
                                }
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
                              value={currentRecipient.address}
                              onChange={(e) => setCurrentRecipient({...currentRecipient, address: e.target.value})}
                              onKeyPress={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  if (currentRecipient.name && currentRecipient.address) {
                                    setRecipients([...recipients, currentRecipient]);
                                    setCurrentRecipient({name: "", address: "", originalInput: ""});
                                    saveRecentRecipient(currentRecipient);
                                  }
                                }
                              }}
                            />
                          </div>
                        </div>
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
                    className="inline-flex items-center px-6 py-3 rounded-lg bg-doc-deep-blue hover:bg-blue-600 text-white font-medium transition-colors"
                  >
                    <SendIcon size={18} className="mr-2" />
                    Send
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
                  recentRecipients.slice(0, 4).map((recipient, index) => {
                    const colors = [
                      'bg-slate-600',    // Dark blue-gray (lloyd's color)
                      'bg-gray-400'      // Light gray (lilly's color)
                    ];
                    const circleColor = colors[index % colors.length];
                    
                    return (
                      <button
                        key={recipient.address}
                        onClick={() => {
                          // Add directly to recipients list if not already added
                          const isAlreadyAdded = recipients.some(r => r.address === recipient.address);
                          if (!isAlreadyAdded && recipients.length < 5) {
                            setRecipients([...recipients, {
                              name: recipient.name,
                              address: recipient.address,
                              originalInput: recipient.originalInput
                            }]);
                          }

                        }}
                        className="flex items-center w-full p-3 rounded-lg hover:bg-doc-soft-blue dark:hover:bg-blue-900/30 transition-colors text-left"
                      >
                        <div className={`w-8 h-8 rounded-full ${circleColor} text-white flex items-center justify-center mr-3`}>
                          {/* Removed: {recipient.name.charAt(0)} */}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{recipient.name.length > 15 ? recipient.name.substring(0, 15) + '...' : recipient.name}</p>
                          <p className="text-xs text-doc-medium-gray truncate">{recipient.address.length > 18 ? recipient.address.substring(0, 18) + '...' : recipient.address}</p>
                        </div>
                        <div className="text-xs text-doc-medium-gray flex items-center">
                          <Clock size={12} className="mr-1" />
                          {formatRelativeTime(new Date(recipient.lastSent))}
                        </div>
                      </button>
                    );
                  })
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
                  Maximum file size is 500MB
                </li>
                <li className="flex">
                  <span className="text-doc-deep-blue mr-2">•</span>
                  Files exist forever, only pay once
                </li>
                <li className="flex">
                  <span className="text-doc-deep-blue mr-2">•</span>
                  Prices are calculated in realtime
                </li>
              </ul>
            </div>
            
            <div className="glass-panel p-6 mt-6">
              <h3 className="font-medium mb-4">Real-Time Pricing Tiers</h3>
              <ul className="space-y-3 text-sm">
                <li className="flex justify-between">
                  <span className="text-doc-medium-gray">1 MB:</span>
                  <span className="font-medium">{calculateTierPrice(1)}</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-doc-medium-gray">300 MB:</span>
                  <span className="font-medium">{calculateTierPrice(300)}</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-doc-medium-gray">500 MB:</span>
                  <span className="font-medium">{calculateTierPrice(500)}</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-doc-medium-gray">Custom sizes:</span>
                  <span className="font-medium">Real-time calculated</span>
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
            // Only clear/reset form if upload has started or completed, or payment was successful
            if (uploading || uploadComplete || paymentStatus === 'success') {
              setPaymentStatus('idle');
              setPaymentError(null);
              setFiles([]);
              setRecipients([]);
              setCurrentRecipient({ name: "", address: "" });
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
            <div className="w-full">
              <p className="text-gray-600 dark:text-gray-400 mb-6 text-center text-sm">
                To send these files securely, a service fee is required. The platform will cover Arweave storage costs.
              </p>
              
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 mb-6">
                <div className="grid grid-cols-2 gap-3">
                  <div className="text-center">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Service Fee</p>
                    <p className="text-lg font-semibold text-blue-600 dark:text-blue-400">${serviceFee} USDC</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">File Size Tier</p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">{fileSizeTier}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Files</p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">{files.length}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Recipients</p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">{recipients.filter(r => r.name && r.address).length}</p>
                  </div>
                </div>
              </div>
              
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center mb-6">
                Only the sender and recipients will be able to access and decrypt these files.
              </p>
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
                <div className="w-full relative">
                  {/* Loading overlay when payment is processing */}
                  {paymentStatus === 'processing' && (
                    <div className="absolute inset-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm rounded-lg z-10 flex flex-col items-center justify-center">
                      <div className="flex items-center space-x-2 mb-2">
                        <div className="w-4 h-4 bg-blue-600 rounded-full animate-pulse"></div>
                        <div className="w-4 h-4 bg-blue-600 rounded-full animate-pulse" style={{animationDelay: '0.2s'}}></div>
                        <div className="w-4 h-4 bg-blue-600 rounded-full animate-pulse" style={{animationDelay: '0.4s'}}></div>
                      </div>
                      <p className="text-gray-700 dark:text-gray-300 text-sm font-medium">Payment in progress...</p>
                    </div>
                  )}
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
                    // Show upload success popup
                    setShowUploadSuccessPopup(true);
                    // Clear payment state to prevent retries
                    setPaymentStatus('idle');
                    handlePostPaymentUpload().then(() => {
                      // Dispatch custom event for notification
                      const event = new CustomEvent('uploadComplete', {
                        detail: {
                          fileName: files[0]?.name || 'File',
                          success: true
                        }
                      });
                      window.dispatchEvent(event);
                    }).catch(err => {
                      console.error('Error in post-payment upload:', err);
                      const errorMessage = err.message || 'Unknown error occurred';
                      
                      // Show user-friendly error message instead of notification
                      toast.error(`Transaction failed: ${errorMessage}. Please try again now or later.`);
                      
                      setUploadError(`Upload failed after successful payment: ${errorMessage}`);
                      setPaymentStatus('error');
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
                  } else if (statusName === 'init') {
                    console.log('Payment initialized...');
                    setPaymentStatus('idle');
                  } else if (statusName === 'fetchingData') {
                    console.log('Payment fetching data...');
                    setPaymentStatus('idle'); // Keep idle until user actually pays
                  } else if (statusName === 'ready') {
                    console.log('Payment ready...');
                    setPaymentStatus('idle'); // Keep idle until user actually pays
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
              {paymentStatus === 'error' as typeof paymentStatus && paymentStatus !== 'success' && (
                <div className="w-full mt-4">
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                    <p className="text-red-600 dark:text-red-400 text-sm font-medium mb-1">
                      Something went wrong. Please try again.
                    </p>
                    <p className="text-red-500 dark:text-red-300 text-xs mb-3">
                      Payment failed: {paymentError}
                    </p>
                    <button 
                      onClick={retryPayment} 
                      className="text-blue-600 dark:text-blue-400 text-sm font-medium hover:underline"
                    >
                      Retry Payment
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
      
      {/* Upload Success Popup */}
      {showUploadSuccessPopup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10000]">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-sm w-full mx-4 text-center">
            <div className="mb-4">
              <svg width="64" height="64" fill="none" viewBox="0 0 64 64" className="mx-auto">
                <circle cx="32" cy="32" r="32" fill="#22c55e" opacity="0.15"/>
                <circle cx="32" cy="32" r="24" fill="#22c55e"/>
                <path d="M22 34l8 8 12-14" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Payment Successful!
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Now uploading your file to Arweave
            </p>
            <button
              onClick={() => setShowUploadSuccessPopup(false)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              OK
            </button>
          </div>
        </div>
      )}
      

      
      {/* Recipient Dialog */}
      <Dialog open={showRecipientDialog} onOpenChange={setShowRecipientDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Recipient</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                Recipient Name
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User size={16} className="text-gray-400" />
                </div>
                <input
                  type="text"
                  placeholder="Enter name or organization"
                  className="pl-10 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none py-2.5 text-gray-900 dark:text-white text-sm transition-all duration-200"
                  value={currentRecipient.name}
                  onChange={(e) => setCurrentRecipient({...currentRecipient, name: e.target.value})}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (currentRecipient.name && currentRecipient.address) {
                        setRecipients([...recipients, currentRecipient]);
                        setCurrentRecipient({name: "", address: "", originalInput: ""});
                        saveRecentRecipient(currentRecipient);
                        setShowRecipientDialog(false);
                      }
                    }
                  }}
                />
              </div>
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
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
                  placeholder="0x..., arweave:..., or name.eth"
                  className="pl-10 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none py-2.5 text-gray-900 dark:text-white text-sm font-mono transition-all duration-200"
                  value={currentRecipient.address}
                  onChange={(e) => handleAddressChange(e.target.value)}
                  disabled={isResolvingName}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (currentRecipient.name && currentRecipient.address) {
                        setRecipients([...recipients, currentRecipient]);
                        setCurrentRecipient({name: "", address: "", originalInput: ""});
                        saveRecentRecipient(currentRecipient);
                        setShowRecipientDialog(false);
                      }
                    }
                  }}
                />
                {isResolvingName && (
                   <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                     <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                   </div>
                 )}
                </div>
                {isResolvingName && (
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                    Resolving name to address...
                  </p>
                )}
                {currentRecipient.address.includes('.eth') && !currentRecipient.address.startsWith('0x') && !isResolvingName && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    ⚠️ Name not yet resolved. Please wait for resolution.
                  </p>
                )}
              </div>
          </div>
          
          <DialogFooter>
            <button
              type="button"
              onClick={() => setShowRecipientDialog(false)}
              className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (currentRecipient.name && currentRecipient.address) {
                  setRecipients([...recipients, currentRecipient]);
                  setCurrentRecipient({name: "", address: "", originalInput: ""});
                  saveRecentRecipient(currentRecipient);
                  setShowRecipientDialog(false);
                }
              }}
              disabled={!currentRecipient.name || !currentRecipient.address}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              Add Recipient
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
       
       {/* Process Notification */}
       <ProcessNotification />
     </div>
   );
};



export default Send;
