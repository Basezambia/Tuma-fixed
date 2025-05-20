import { useState, useEffect, useCallback } from "react";
import { FileUp, Send as SendIcon, User, Users, X, AlertCircle, Coins, Clock, Bell } from "lucide-react";
import { toast } from "sonner";
import Header from "@/components/Header";
import { arweaveService, FileMetadata } from "@/lib/arweave-service";
import { encryptFileBufferHKDF } from '@/lib/encryption';
import { calculateArweaveCostSync, getFileSizeTier } from '@/lib/arweaveCalculator';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useAccount } from 'wagmi';
import { Checkout, CheckoutButton, CheckoutStatus } from '@coinbase/onchainkit/checkout';

const Send = () => {
  // ...existing state declarations...
  const [uploadTimeoutId, setUploadTimeoutId] = useState<NodeJS.Timeout | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [totalFileSize, setTotalFileSize] = useState<number>(0);
  const [recipients, setRecipients] = useState<{name: string, address: string}[]>([]);
  const [currentRecipientName, setCurrentRecipientName] = useState("");
  const [currentRecipientAddress, setCurrentRecipientAddress] = useState("");
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

  // Add error handling for useAccount
  let senderAddress = undefined;
  try {
    const { address } = useAccount();
    senderAddress = address;
  } catch (err) {
    console.error('Error getting account:', err);
    senderAddress = undefined;
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      // Calculate total size including existing files
      const newTotalSize = [...files, ...newFiles].reduce((sum, file) => sum + file.size, 0);
      setFiles(prev => [...prev, ...newFiles]);
      setTotalFileSize(newTotalSize);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => {
      const newFiles = [...prev];
      // Recalculate total size by removing the file at index
      const removedFileSize = newFiles[index]?.size || 0;
      setTotalFileSize(totalFileSize - removedFileSize);
      newFiles.splice(index, 1);
      return newFiles;
    });
  };
  
  const addRecipient = () => {
    if (!currentRecipientName || !currentRecipientAddress) {
      toast.error("Please enter both recipient name and address");
      return;
    }
    
    if (recipients.length >= 5) {
      toast.error("Maximum of 5 recipients allowed");
      return;
    }
    
    // Check if recipient address already exists
    if (recipients.some(r => r.address === currentRecipientAddress)) {
      toast.error("This recipient address is already added");
      return;
    }
    
    setRecipients(prev => [...prev, {
      name: currentRecipientName,
      address: currentRecipientAddress
    }]);
    
    // Clear the input fields
    setCurrentRecipientName("");
    setCurrentRecipientAddress("");
  };
  
  const removeRecipient = (index: number) => {
    setRecipients(prev => {
      const newRecipients = [...prev];
      newRecipients.splice(index, 1);
      return newRecipients;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (files.length === 0) {
      toast.error("Please select at least one file to send");
      return;
    }
    
    if (recipients.length === 0) {
      toast.error("Please add at least one recipient");
      return;
    }
    
    if (recipients.length > 5) {
      toast.error("Maximum of 5 recipients allowed");
      return;
    }
    
    try {
      // Start sending process
      setSending(true);
      
      // 1. Upload file to Arweave
      const metadata: FileMetadata = {
        name: files[0].name,  // Using the first file in the array
        type: files[0].type,
        size: totalFileSize,  // Using total size of all files
        sender: senderAddress,
        recipient: recipients[0]?.address || "",  // Using the first recipient's address
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
    if (totalFileSize > 0) {
      let tier = null;
      let fee = null;
      const sizeMB = totalFileSize / 1024 / 1024;
      const sizeKB = totalFileSize / 1024;
      
      // Pricing tiers based on total file size
      if (sizeKB < 100) {
        tier = 'Tier 0 (<100KB)';
        fee = '0.05';
      } else if (sizeMB < 10) {
        tier = 'Tier 1 (100KB-10MB)';
        fee = '0.50';
      } else if (sizeMB < 20) {
        tier = 'Tier 2 (10-20MB)';
        fee = '1.00';
      } else if (sizeMB < 50) {
        tier = 'Tier 3 (20-50MB)';
        fee = '2.00';
      } else {
        // Dynamic pricing for files above 50MB using Arweave calculator with 70% markup
        if (sizeMB < 100) {
          tier = 'Tier 4 (50-100MB) - Dynamic Pricing';
        } else {
          tier = 'Tier 5 (>100MB) - Dynamic Pricing';
        }
        fee = calculateArweaveCostSync(totalFileSize);
      }
      setFileSizeTier(tier);
      setServiceFee(fee);
    } else {
      setFileSizeTier(null);
      setServiceFee('0.00');
    }
  }, [totalFileSize]);

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
          metadata: { sender: senderAddress, recipient: recipients[0]?.address || "", documentId }
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
  }, [serviceFee, paymentCurrency, fileSizeTier, senderAddress, recipients, documentId]);

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
    
    // Store current state before clearing
    const filesToUpload = [...files];
    const recipientsToSend = [...recipients];
    const messageToSend = message;
    
    // Clear form for next use
    setFiles([]);
    setTotalFileSize(0);
    setRecipients([]);
    setMessage("");
    
    // Track successful uploads
    let successfulUploads = 0;
    let totalUploads = filesToUpload.length * recipientsToSend.length;
    let uploadErrors = [];
    
    // For each recipient, upload each file
    for (const recipient of recipientsToSend) {
      for (const file of filesToUpload) {
        // Generate a unique document ID for each file-recipient pair
        const fileDocumentId = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        
        let cipherArr;
        let metadata;
        
        try {
          // Step 1: Validate inputs and encrypt file
          if (!file || !recipient.address || !senderAddress) throw new Error('Missing file or addresses');
          const buffer = await file.arrayBuffer();
          if (!fileDocumentId) throw new Error('Missing documentId for salt');
          
          const { ciphertext, iv } = await encryptFileBufferHKDF(
            buffer, 
            senderAddress.toLowerCase(), 
            recipient.address.toLowerCase(), 
            fileDocumentId
          );
          
          // Step 2: Calculate hash
          const hashBuffer = await crypto.subtle.digest('SHA-256', Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0)));
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          const sha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
          
          // Step 3: Create metadata
          metadata = {
            name: file.name,
            type: file.type,
            size: file.size,
            sender: senderAddress.toLowerCase(),
            recipient: recipient.address.toLowerCase(),
            recipientName: recipient.name,
            timestamp: Date.now(),
            description: message || undefined,
            iv,
            sha256,
            chargeId: chargeId || undefined,
            documentId: fileDocumentId,
          };
          
          // Step 4: Convert ciphertext to array
          if (typeof ciphertext === 'string') {
            cipherArr = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
          } else {
            throw new Error('Invalid ciphertext type');
          }
          
          // Step 5: Upload to Arweave
          const toastId = toast.loading(`Uploading ${file.name} to ${recipient.name}...`);
          
          const arweaveTxId = await arweaveService.uploadFileToArweave(
            cipherArr,
            metadata,
            (pct) => {
              // Calculate overall progress based on current file's progress and completed files
              const overallProgress = Math.round((successfulUploads / totalUploads) * 100 + (pct / totalUploads));
              setUploadProgress(overallProgress);
            }
          );
          
          // Step 6: Handle successful upload
          successfulUploads++;
          
          // Set the last successful upload as the displayed one
          setArweaveTxId(arweaveTxId);
          
          toast.success(`File ${file.name} sent to ${recipient.name}!`, { id: toastId });
          
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('tuma:newSentFile', { detail: {
              id: arweaveTxId,
              metadata
            }}));
          }
          
        } catch (err) {
          // Handle any errors during the process
          console.error('Error processing file:', err);
          uploadErrors.push(`${file.name} to ${recipient.name}: ${err.message || 'Unknown error'}`);
          toast.error(`Failed to process ${file.name} for ${recipient.name}: ${err.message || 'Unknown error'}`);
        }
      }
    }

    // Set overall status
    if (successfulUploads === totalUploads) {
      setUploadComplete(true);
      toast.success(`All ${totalUploads} files sent successfully!`);
    } else if (successfulUploads > 0) {
      setUploadComplete(true);
      toast.success(`${successfulUploads} of ${totalUploads} files sent successfully.`);
      if (uploadErrors.length > 0) {
        setUploadError(`Some files failed to upload: ${uploadErrors.length} errors`);
      }
    } else {
      setUploadError('All uploads failed');
      toast.error('All uploads failed');
    }

    setUploading(false);
  };

// ...

  // State for recent recipients
  const [recentRecipients, setRecentRecipients] = useState<{ name: string; address: string; lastSent?: number }[]>([]);
  const [isLoadingRecipients, setIsLoadingRecipients] = useState(false);

  // ...

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
                    Select Files (Max 100MB total)
                  </label>
                  <div className="flex items-center justify-center w-full">
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:hover:border-gray-500">
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <FileUp className="w-8 h-8 mb-3 text-gray-500 dark:text-gray-400" />
                        <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
                          <span className="font-semibold">Click to upload</span> or drag and drop
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          PDF, DOC, DOCX, JPG, PNG, etc. (Max 100MB total)
                        </p>
                      </div>
                      <input
                        id="dropzone-file"
                        type="file"
                        className="hidden"
                        onChange={handleFileChange}
                        disabled={sending}
                        multiple
                      />
                    </label>
                  </div>

                  {files.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Selected Files</h3>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          Total: {(totalFileSize / 1024 / 1024).toFixed(2)} MB
                        </span>
                      </div>
                      {files.map((file, index) => (
                        <div key={index} className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
                          <div className="flex items-center space-x-3">
                            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-800 flex items-center justify-center">
                              <FileUp className="w-5 h-5 text-blue-600 dark:text-blue-300" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate dark:text-white">
                                {file.name}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {(file.size / 1024 / 1024).toFixed(2)} MB
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeFile(index)}
                            className="flex-shrink-0 ml-2 p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
                            disabled={sending}
                          >
                            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mb-6">
                  {/* Recipients */}
                  <div className="space-y-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Recipients (Max 5)
                    </label>
                    <div className="flex flex-col space-y-3">
                      <div className="flex space-x-2">
                        <input
                          type="text"
                          placeholder="Recipient Name"
                          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                          value={currentRecipientName}
                          onChange={(e) => setCurrentRecipientName(e.target.value)}
                          disabled={sending || recipients.length >= 5}
                        />
                        <input
                          type="text"
                          placeholder="Recipient Wallet Address"
                          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                          value={currentRecipientAddress}
                          onChange={(e) => setCurrentRecipientAddress(e.target.value)}
                          disabled={sending || recipients.length >= 5}
                        />
                        <button
                          type="button"
                          onClick={addRecipient}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                          disabled={sending || recipients.length >= 5 || !currentRecipientName || !currentRecipientAddress}
                        >
                          Add
                        </button>
                      </div>

                      {recipients.length > 0 && (
                        <div className="space-y-2 mt-2">
                          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Added Recipients</h3>
                          {recipients.map((recipient, index) => (
                            <div key={index} className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/30 rounded-lg">
                              <div className="flex items-center space-x-3">
                                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-green-100 dark:bg-green-800 flex items-center justify-center">
                                  <User className="w-5 h-5 text-green-600 dark:text-green-300" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-900 truncate dark:text-white">
                                    {recipient.name}
                                  </p>
                                  <p className="text-xs text-gray-500 truncate dark:text-gray-400">
                                    {recipient.address}
                                  </p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeRecipient(index)}
                                className="flex-shrink-0 ml-2 p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
                                disabled={sending}
                              >
                                <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Message (Optional)
                  </label>
                  <textarea
                    placeholder="Add a message to the recipient..."
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white h-32 resize-none"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    disabled={sending}
                  ></textarea>
                </div>

                <div className="flex justify-between items-center">
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {fileSizeTier && (
                      <div className="flex items-center space-x-1">
                        <span>Tier: {fileSizeTier}</span>
                        <span>•</span>
                        <span>Fee: {serviceFee} USDC</span>
                      </div>
                    )}
                  </div>
                  <button
                    type="submit"
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                    disabled={sending || files.length === 0 || recipients.length === 0}
                  >
                    <SendIcon className="w-5 h-5" />
                    <span>Send</span>
                  </button>
                </div>
              </form>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-bold mb-4">Pricing Tiers</h2>
            <div className="space-y-2">
              <div className="flex justify-between items-center py-2 border-b border-gray-200 dark:border-gray-700">
                <span>Tier 0 (&lt;100KB)</span>
                <span className="font-semibold">0.05 USDC</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-200 dark:border-gray-700">
                <span>Tier 1 (100KB-10MB)</span>
                <span className="font-semibold">0.50 USDC</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-200 dark:border-gray-700">
                <span>Tier 2 (10-20MB)</span>
                <span className="font-semibold">1.00 USDC</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-200 dark:border-gray-700">
                <span>Tier 3 (20-50MB)</span>
                <span className="font-semibold">2.00 USDC</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-200 dark:border-gray-700">
                <span>Tier 4 (50-100MB)</span>
                <span className="font-semibold">Dynamic Pricing</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span>Tier 5 (&gt;100MB)</span>
                <span className="font-semibold">Dynamic Pricing</span>
              </div>
            </div>
          </div>
        </div>
      </main>
      
      <Dialog open={showPaymentDialog} onOpenChange={(open) => {
          if (!open) {
            setShowPaymentDialog(false);
            // Only clear/reset form if upload has started or completed
            if (uploading || uploadComplete) {
              setPaymentStatus('idle');
              setPaymentError(null);
              setFiles([]);
              setTotalFileSize(0);
              setRecipients([]);
              setCurrentRecipientName("");
              setCurrentRecipientAddress("");
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
