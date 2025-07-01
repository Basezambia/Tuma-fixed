import React, { useState, useEffect, useCallback } from 'react';
import { Lock, Upload, File, Folder, Eye, EyeOff, Download, Trash2, Plus, AlertCircle, X, Grid, List, Filter, ArrowLeft } from "lucide-react";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { arweaveService, StoredFile } from "@/lib/arweave-service";
import { useAccount } from 'wagmi';
import { encryptFileBufferHKDF, decryptFileBufferHKDF } from '../lib/encryption';
import { fetchPaymentStatus } from "@/lib/payment-status";
import { useNavigate } from 'react-router-dom';
import { Checkout, CheckoutButton, CheckoutStatus } from '@coinbase/onchainkit/checkout';

// Add this to declare the webkitdirectory attribute
declare module 'react' {
  interface InputHTMLAttributes<T> extends HTMLAttributes<T> {
    webkitdirectory?: boolean | undefined;
  }
}

interface VaultFile extends StoredFile {
  isFolder?: boolean;
  parentFolder?: string;
  isDeleted?: boolean;
}

const Vault = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isFirstTime, setIsFirstTime] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [vaultFiles, setVaultFiles] = useState<VaultFile[]>([]);
  const [currentFolder, setCurrentFolder] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [showUploadSection, setShowUploadSection] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list'); // Default to list
  const [showHiddenFiles, setShowHiddenFiles] = useState(false);
  const [deletedFiles, setDeletedFiles] = useState<Set<string>>(new Set());
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [openFolder, setOpenFolder] = useState<string | null>(null);
  const [folderStack, setFolderStack] = useState<Array<{id: string, name: string}>>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [totalSize, setTotalSize] = useState(0);
  const [arweavePricing, setArweavePricing] = useState<{
    pricePerMBInAR: number;
    pricePerMBInUSD: number;
    pricePerMBInWinston: number;
    arToUsdRate: number;
    timestamp: number;
    networkFactor: number;
  } | null>(null);
  const [isLoadingArweavePricing, setIsLoadingArweavePricing] = useState(false);
  const [arweavePricingError, setArweavePricingError] = useState<string | null>(null);
  const [serviceFee, setServiceFee] = useState<string | null>(null);
  const [fileSizeTier, setFileSizeTier] = useState<string | null>(null);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showFileDetailsDialog, setShowFileDetailsDialog] = useState(false);
  const [selectedFileDetails, setSelectedFileDetails] = useState(null);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'pending' | 'processing' | 'success' | 'error'>('idle');
  const [chargeId, setChargeId] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [filesPerPage] = useState(5);
  
  const { address } = useAccount();
  const navigate = useNavigate();

  // Check vault access on address change
  useEffect(() => {
    if (address) {
      const storageKey = `vault_password_${address.toLowerCase()}`;
      const creatorKey = `vault_creator_${address.toLowerCase()}`;
      
      const hasVaultPassword = localStorage.getItem(storageKey);
      const storedCreator = localStorage.getItem(creatorKey);
      
      // Check if vault exists and belongs to current address
      if (hasVaultPassword && storedCreator === address.toLowerCase()) {
        setIsFirstTime(false);
      } else {
        setIsFirstTime(true);
        setIsAuthenticated(false); // Lock vault if address changes
      }
    } else {
      // No wallet connected, lock vault
      setIsAuthenticated(false);
      setIsFirstTime(false);
    }
  }, [address]);

  // Hash password with wallet address as additional salt
  const hashPassword = async (password: string, salt: string, address: string): Promise<string> => {
    const encoder = new TextEncoder();
    // Include wallet address in the hash to bind password to specific user
    const data = encoder.encode(password + salt + address.toLowerCase());
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  // Generate cryptographically secure salt
  const generateSalt = (): string => {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  };

  // Create new vault password (address-bound)
  const createVaultPassword = async () => {
    if (!address) {
      toast.error("Please connect your wallet first");
      return;
    }

    if (password.length < 12) {
      toast.error("Password must be at least 12 characters long");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    // Enhanced password strength validation
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    if (!hasUpperCase || !hasLowerCase || !hasNumbers || !hasSpecialChar) {
      toast.error("Password must contain uppercase, lowercase, numbers, and special characters");
      return;
    }

    setLoading(true);
    try {
      const salt = generateSalt();
      // Hash password with wallet address binding
      const hashedPassword = await hashPassword(password, salt, address);
      
      // Store with address-specific keys
      const storageKey = `vault_password_${address.toLowerCase()}`;
      const saltKey = `vault_salt_${address.toLowerCase()}`;
      const creatorKey = `vault_creator_${address.toLowerCase()}`;
      
      localStorage.setItem(storageKey, hashedPassword);
      localStorage.setItem(saltKey, salt);
      localStorage.setItem(creatorKey, address.toLowerCase()); // Store creator address
      
      setIsAuthenticated(true);
      setIsFirstTime(false);
      toast.success("Vault password created and bound to your wallet!");
      loadVaultFiles();
    } catch (error) {
      toast.error("Failed to create vault password");
    } finally {
      setLoading(false);
    }
  };

  // Load deleted files from localStorage on component mount
  useEffect(() => {
    const savedDeletedFiles = localStorage.getItem('vault_deleted_files');
    if (savedDeletedFiles) {
      setDeletedFiles(new Set(JSON.parse(savedDeletedFiles)));
    }
  }, []);

  // Save deleted files to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('vault_deleted_files', JSON.stringify(Array.from(deletedFiles)));
  }, [deletedFiles]);

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
      
      if (data.error) {
        throw new Error(data.message || 'API returned error');
      }
      
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

  // Calculate dynamic pricing based on Arweave token price with 20% profit margin
  const calculateDynamicPrice = useCallback((sizeMB: number, pricingData: any) => {
    if (!pricingData) return null;
    
    const sizeInBytes = sizeMB * 1024 * 1024;
    
    // Use ArDrive-inspired calculation with proper overhead and bundling fees
    let baseCostWinston;
    
    // Use tiered pricing for better accuracy
    if (sizeInBytes <= 1024) {
      // Small files: use 1KB pricing
      baseCostWinston = Number(pricingData.uploadCosts?.['1KB']?.winston || pricingData.pricePerMBInWinston / 1024);
    } else if (sizeInBytes <= 1024 * 1024) {
      // Medium files: interpolate between 1KB and 1MB
      const ratio = sizeInBytes / (1024 * 1024);
      baseCostWinston = Number(pricingData.uploadCosts?.['1MB']?.winston || pricingData.pricePerMBInWinston) * ratio;
    } else {
      // Large files: use per-MB calculation with proper scaling
      baseCostWinston = (Number(pricingData.uploadCosts?.['1MB']?.winston || pricingData.pricePerMBInWinston) / (1024 * 1024)) * sizeInBytes;
    }
    
    // Apply ArDrive-style adjustments
    const dataItemOverhead = Math.ceil(sizeInBytes * 0.001); // Data item structure overhead
    const bundlingFee = Math.ceil(baseCostWinston * 0.05); // 5% bundling fee
    const totalWinston = baseCostWinston + dataItemOverhead + bundlingFee;
    
    // Convert to USD
    const totalAR = totalWinston / 1e12;
    const baseCostInUSD = totalAR * pricingData.arToUsdRate;
    
    // Apply network factor for congestion
    const adjustedCostInUSD = baseCostInUSD * (pricingData.networkFactor || 1.0);
    
    // Add service margin (15% instead of 20% for better competitiveness)
    const totalCostWithMargin = adjustedCostInUSD * 1.15;
    
    // Ensure minimum viable pricing for very small files
    const minimumPrice = 0.01; // $0.01 minimum
    const finalPrice = Math.max(totalCostWithMargin, minimumPrice);
    
    return finalPrice.toFixed(2);
  }, []);

  // Calculate pricing for specific size tiers using real-time Arweave data
  const calculateTierPrice = useCallback((sizeMB: number) => {
    if (!arweavePricing) return 'Loading...';
    
    const dynamicPrice = calculateDynamicPrice(sizeMB, arweavePricing);
    return dynamicPrice ? `$${dynamicPrice} USDC` : 'Calculating...';
  }, [arweavePricing, calculateDynamicPrice]);

  // Calculate total size in MB
  const getTotalFileSize = useCallback((): number => {
    return selectedFiles.reduce((total, file) => total + file.size, 0);
  }, [selectedFiles]);

  // Dynamic pricing calculation effect
  useEffect(() => {
    if (selectedFiles.length > 0) {
      let tier = null;
      let fee = null;
      const totalSizeMB = getTotalFileSize() / 1024 / 1024;
      
      // All pricing tiers now use dynamic real-time pricing with 7% profit margin
      if (totalSizeMB < 1) {
        tier = 'Below 1MB';
      } else if (totalSizeMB < 10) {
        tier = '1MB - 10MB';
      } else if (totalSizeMB < 30) {
        tier = '10MB - 30MB';
      } else if (totalSizeMB < 100) {
        tier = '30MB - 100MB';
      } else if (totalSizeMB <= 5000) { // Up to 5GB for vault
        tier = `${totalSizeMB.toFixed(0)}MB - Dynamic`;
      } else {
        // Over 5GB - not allowed
        tier = 'File too large';
        toast.error('Maximum file size is 5GB');
        setFileSizeTier(tier);
        setServiceFee(null);
        return;
      }
      
      // Calculate dynamic pricing for all file sizes using real API prices only
      if (arweavePricing && arweavePricing.timestamp > Date.now() - 3600000) { // Cache for 1 hour
        const dynamicFee = calculateDynamicPrice(totalSizeMB, arweavePricing);
        if (dynamicFee && parseFloat(dynamicFee) > 0) {
          fee = dynamicFee; // Use actual API price only
        } else {
          fee = null; // Wait for valid pricing
        }
      } else {
        // Wait for real-time data, no fallback
        fee = null;
        
        // Fetch fresh pricing data
        fetchArweavePricing().then(pricingData => {
          if (pricingData) {
            const dynamicFee = calculateDynamicPrice(totalSizeMB, pricingData);
            if (dynamicFee && parseFloat(dynamicFee) > 0) {
              setServiceFee(dynamicFee); // Use real API price only
            }
          }
        });
      }
      
      setFileSizeTier(tier);
      setServiceFee(fee);
    } else {
      setFileSizeTier(null);
      setServiceFee(null); // No files, no fee
    }
  }, [selectedFiles, arweavePricing, calculateDynamicPrice, fetchArweavePricing, getTotalFileSize]);

  // Fetch Arweave pricing on component mount
  useEffect(() => {
    fetchArweavePricing();
    
    const intervalId = setInterval(() => {
      fetchArweavePricing();
    }, 3600000);
    
    return () => clearInterval(intervalId);
  }, [fetchArweavePricing]);

  // Charge handler
  const chargeHandler = useCallback(async (): Promise<string> => {
    try {
      if (!address) {
        throw new Error('Wallet not connected. Please connect your wallet to proceed with payment.');
      }

      if (selectedFiles.length === 0) {
        throw new Error('No files selected for upload');
      }

      if (!serviceFee) {
        throw new Error('Pricing is still loading. Please wait for real-time pricing calculation.');
      }
      const fee = Number(serviceFee);
      if (isNaN(fee) || fee <= 0) {
        throw new Error('Invalid service fee amount');
      }

      setPaymentStatus('processing');
      setPaymentError(null);
      
      const requestBody = {
        amount: serviceFee,
        currency: 'USDC',
        name: 'Tuma Vault Storage',
        description: `Payment for storing ${selectedFiles.length} file(s) in vault`,
        metadata: { 
          sender: address, 
          fileCount: selectedFiles.length,
          totalSize: getTotalFileSize(),
          type: 'vault_storage',
          timestamp: new Date().toISOString()
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
      
    } catch (error: any) {
      console.error('Payment error:', error);
      const errorMessage = error.message || 'Failed to process payment';
      setPaymentStatus('error');
      setPaymentError(errorMessage);
      throw new Error(errorMessage);
    }
  }, [address, selectedFiles.length, serviceFee, getTotalFileSize]);

  // Poll payment status
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (
      paymentStatus === 'processing' &&
      chargeId &&
      !isUploading &&
      !uploadError
    ) {
      const poll = async () => {
        try {
          const res = await fetch(`/api/chargeStatus?chargeId=${chargeId}`);
          const data = await res.json();
          if (data.statusName && ['PENDING', 'pending'].includes(data.statusName)) {
            setPaymentStatus('success');
            setPaymentError(null);
            setShowPaymentDialog(false);
            toast.success('Payment verified! Starting upload...');
            setTimeout(() => handlePostPaymentUpload(), 500);
          } else if (data.statusName && ['CONFIRMED', 'COMPLETED', 'confirmed', 'completed', 'RESOLVED', 'resolved', 'PAID', 'paid', 'SUCCESS', 'success'].includes(data.statusName)) {
            setPaymentStatus('success');
            setPaymentError(null);
            setShowPaymentDialog(false);
            toast.success('Payment verified! Starting upload...');
            setTimeout(() => handlePostPaymentUpload(), 500);
          } else if (data.statusName && data.statusName.toLowerCase().includes('error')) {
            setPaymentStatus('error');
            setPaymentError('Payment failed');
            setShowPaymentDialog(false);
            toast.error('Payment failed. Please try again.');
          }
        } catch (e: any) {
          console.error('Error polling payment status:', e);
        }
      };
      poll();
      interval = setInterval(poll, 5000);
    }
    return () => interval && clearInterval(interval);
  }, [paymentStatus, chargeId, isUploading, uploadError]);

  // Handle post-payment upload
  const handlePostPaymentUpload = async () => {
    if (selectedFiles.length === 0) {
      setUploadError('No files selected for upload');
      return;
    }
    
    if (!address) {
      setUploadError('Wallet not connected');
      return;
    }
    
    try {
      setIsUploading(true);
      setUploadProgress(0);
      setUploadError(null);
      
      // Show encryption notification
      toast.info('Encrypting files...');
      
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        setUploadProgress(((i + 1) / selectedFiles.length) * 100);
        
        // Show uploading notification for each file
        if (i === 0) {
          toast.info('Uploading to Arweave...');
        }
        
        await uploadFileToVault(file);
      }
      
      toast.success("Files stored in vault successfully!");
      
      // Reset upload states
      setSelectedFiles([]);
      setTotalSize(0);
      setShowUploadSection(false);
      setPaymentStatus('idle');
      setChargeId(null);
      setPaymentError(null);
      
      // Refresh vault files
      await loadVaultFiles();
      
      // Dispatch notification events for each uploaded file
      // Add delay to allow Arweave indexing
      setTimeout(() => {
        selectedFiles.forEach(file => {
          // Dispatch uploadComplete event for header notifications
          const uploadEvent = new CustomEvent('uploadComplete', {
            detail: {
              fileName: file.name,
              success: true
            }
          });
          window.dispatchEvent(uploadEvent);
          
          // Dispatch tuma:newSentFile event for vault files
          const sentFileEvent = new CustomEvent('tuma:newSentFile', {
            detail: {
              id: `vault_file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              metadata: {
                name: file.name,
                sender: address.toLowerCase(),
                recipient: address.toLowerCase(), // For vault, sender and recipient are the same
                timestamp: Date.now(),
                isVault: true
              }
            }
          });
          window.dispatchEvent(sentFileEvent);
        });
      }, 1000); // 1 second delay before dispatching events
      
      loadVaultFiles();
      setSelectedFiles([]);
      setTotalSize(0);
      setShowUploadSection(false);
      setPaymentStatus('idle');
      setChargeId(null);
      setShowPaymentDialog(false);
    } catch (error) {
      console.error("Upload error:", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setUploadError(errorMessage);
      toast.error("Failed to upload files");
      setShowPaymentDialog(false);
      
      // Dispatch failed upload event for notification
      const failedEvent = new CustomEvent('uploadComplete', {
        detail: {
          fileName: selectedFiles[0]?.name || 'File',
          success: false,
          error: errorMessage
        }
      });
      window.dispatchEvent(failedEvent);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  // Verify vault password (address-bound verification)
  const verifyPassword = async () => {
    if (!address) {
      toast.error("Please connect your wallet first");
      return;
    }

    setLoading(true);
    try {
      const storageKey = `vault_password_${address.toLowerCase()}`;
      const saltKey = `vault_salt_${address.toLowerCase()}`;
      const creatorKey = `vault_creator_${address.toLowerCase()}`;
      
      const storedHash = localStorage.getItem(storageKey);
      const storedSalt = localStorage.getItem(saltKey);
      const storedCreator = localStorage.getItem(creatorKey);
      
      if (!storedHash || !storedSalt || !storedCreator) {
        toast.error("No vault found for this wallet. Please create a vault first.");
        setIsFirstTime(true);
        return;
      }

      // Verify the current address matches the creator address
      if (storedCreator !== address.toLowerCase()) {
        toast.error("Access denied. This vault belongs to a different wallet.");
        return;
      }

      // Hash input password with current address
      const inputHash = await hashPassword(password, storedSalt, address);
      
      if (inputHash === storedHash) {
        setIsAuthenticated(true);
        toast.success("Vault unlocked successfully!");
        loadVaultFiles();
      } else {
        toast.error("Invalid password. Please try again.");
      }
    } catch (error) {
      toast.error("Authentication failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Enhanced lock vault function
  const lockVault = () => {
    setIsAuthenticated(false);
    setPassword("");
    setConfirmPassword("");
    setShowUploadSection(false);
    toast.success("Vault locked successfully!");
    navigate('/profile');
  };

  // Load vault files from Arweave
  const loadVaultFiles = async () => {
    if (!address) return;
    try {
      const files = await arweaveService.getSentFiles(address);
      // Filter files that are marked as vault files
      const vaultFiles = files.filter(file => 
        file.metadata.description?.includes("[VAULT]") ||
        file.metadata.documentId?.startsWith("vault_")
      );
      setVaultFiles(vaultFiles);
    } catch (error) {
      console.error("Error loading vault files:", error);
      toast.error("Failed to load vault files");
    }
  };

  // Handle file selection with limits (for initial selection)
  const handleFileSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    
    if (files.length > 8) {
      toast.error("Maximum 8 files allowed");
      return;
    }
    
    const newTotalSize = files.reduce((acc, file) => acc + file.size, 0);
    if (newTotalSize > 5 * 1024 * 1024 * 1024) { // 5GB limit
      toast.error("Total file size cannot exceed 5GB");
      return;
    }
    
    setSelectedFiles(files);
    setTotalSize(newTotalSize);
  };

  // Handle adding additional files to existing selection
  const handleAdditionalFileSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(event.target.files || []);
    
    if (selectedFiles.length + newFiles.length > 8) {
      toast.error(`Can only add ${8 - selectedFiles.length} more files (maximum 8 total)`);
      return;
    }
    
    // Check for duplicate files
    const duplicates = newFiles.filter(newFile => 
      selectedFiles.some(existingFile => 
        existingFile.name === newFile.name && existingFile.size === newFile.size
      )
    );
    
    if (duplicates.length > 0) {
      toast.error(`Duplicate files detected: ${duplicates.map(f => f.name).join(', ')}`);
      return;
    }
    
    const combinedFiles = [...selectedFiles, ...newFiles];
    const newTotalSize = combinedFiles.reduce((acc, file) => acc + file.size, 0);
    
    if (newTotalSize > 5 * 1024 * 1024 * 1024) { // 5GB limit
      toast.error("Total file size cannot exceed 5GB");
      return;
    }
    
    setSelectedFiles(combinedFiles);
    setTotalSize(newTotalSize);
    
    // Reset the input value to allow selecting the same files again if needed
    event.target.value = '';
  };

  // Remove selected file
  const removeSelectedFile = (index: number) => {
    const newFiles = selectedFiles.filter((_, i) => i !== index);
    setSelectedFiles(newFiles);
    setTotalSize(newFiles.reduce((acc, file) => acc + file.size, 0));
  };

  // Store files function
  const storeFiles = async () => {
    if (selectedFiles.length === 0) {
      toast.error("Please select files to store");
      return;
    }
    
    if (!address) {
      toast.error("Please connect your wallet first");
      return;
    }
    
    // Start payment process only - no upload yet
    setShowPaymentDialog(true);
    setPaymentStatus('idle');
    setPaymentError(null);
    setUploadError(null);
    
    try {
      // Only initiate payment, upload will happen after payment confirmation
      await chargeHandler();
    } catch (error) {
      console.error("Payment initiation error:", error);
      toast.error("Failed to initiate payment");
      setShowPaymentDialog(false);
    }
  };

  // Remove the simultaneous upload function as it's no longer needed

  // Upload folder to vault (existing function)
  const uploadFolderToVault = async (folderName: string, files: File[]) => {
    if (!address) throw new Error("Wallet not connected");
    
    // Create folder metadata first
    const folderDocumentId = `vault_folder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const folderMetadata = {
      name: folderName,
      type: "folder",
      size: files.reduce((acc, file) => acc + file.size, 0),
      sender: address.toLowerCase(),
      recipient: address.toLowerCase(),
      recipients: [address.toLowerCase()],
      timestamp: Date.now(),
      description: `[VAULT] [FOLDER] ${folderName}`,
      documentId: folderDocumentId,
      fileCount: files.length
    };

    // Upload folder metadata
    await arweaveService.uploadFileToArweave(
      new Uint8Array(0),
      folderMetadata
    );

    // Upload each file in the folder
    for (const file of files) {
      await uploadFileToVault(file, folderDocumentId, file.webkitRelativePath);
    }
  };

  // Modified uploadFileToVault to support folder context
  const uploadFileToVault = async (file: File, parentFolderId?: string, relativePath?: string) => {
    if (!address) throw new Error("Wallet not connected");

    try {
      // Generate unique document ID for vault file
      const documentId = parentFolderId 
        ? `vault_file_${parentFolderId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        : `vault_file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Read file as buffer
      const fileBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(fileBuffer);

      // Encrypt file with HKDF using address as both sender and recipient for vault
      const encryptedData = await encryptFileBufferHKDF(
        fileBuffer,
        address.toLowerCase(),
        address.toLowerCase(),
        password + documentId // Use password + documentId as salt
      );

      // Convert encrypted data to Uint8Array for upload
      const encryptedBuffer = new TextEncoder().encode(JSON.stringify(encryptedData));

      // Create metadata for vault file
      const metadata = {
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
        sender: address.toLowerCase(),
        recipient: address.toLowerCase(),
        recipients: [address.toLowerCase()],
        timestamp: Date.now(),
        description: parentFolderId 
          ? `[VAULT] [FILE] ${file.name} in folder`
          : `[VAULT] [FILE] ${file.name}`,
        documentId: documentId,
        parentFolder: parentFolderId,
        relativePath: relativePath,
        encrypted: true,
        encryptionMethod: 'HKDF-AES-GCM'
      };

      // Upload to Arweave
      const result = await arweaveService.uploadFileToArweave(encryptedBuffer, metadata);
      
      return result;
    } catch (error) {
      console.error('Error uploading file to vault:', error);
      throw error;
    }
  };

  // Download individual file
  const downloadFile = async (file: VaultFile) => {
    try {
      toast.success(`Downloading ${file.metadata.name}...`);
      
      // Fetch the encrypted file data from Arweave
      const response = await fetch(`https://arweave.net/${file.id}`);
      const encryptedDataText = await response.text();
      const encryptedData = JSON.parse(encryptedDataText);
      
      // Decrypt the file using the vault password
      const decryptedBuffer = await decryptFileBufferHKDF(
        encryptedData.ciphertext,
        encryptedData.iv,
        address.toLowerCase(),
        address.toLowerCase(),
        password + file.metadata.documentId
      );
      
      // Create blob and download
      const blob = new Blob([decryptedBuffer], { type: file.metadata.type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.metadata.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success(`${file.metadata.name} downloaded successfully!`);
    } catch (error) {
      console.error('Download error:', error);
      toast.error("Failed to download file");
    }
  };

  // Download entire folder
  const downloadFolder = async (folderId: string, folderName: string) => {
    try {
      const folderFiles = vaultFiles.filter(file => file.metadata.parentFolderId === folderId);
      toast.success(`Downloading folder ${folderName} with ${folderFiles.length} files...`);
      // Add actual folder download logic here
    } catch (error) {
      toast.error("Failed to download folder");
    }
  };

  // Open folder
  const openFolderHandler = (folderId: string, folderName: string) => {
    setFolderStack(prev => [...prev, {id: folderId, name: folderName}]);
    setOpenFolder(folderId);
    setSelectedFile(null);
  };

  // Go back to parent folder
  const goBack = () => {
    const newStack = [...folderStack];
    newStack.pop();
    setFolderStack(newStack);
    setOpenFolder(newStack.length > 0 ? newStack[newStack.length - 1].id : null);
    setSelectedFile(null);
  };

  // Delete file/folder - now marks as deleted instead of removing
  const deleteItem = async (fileId: string) => {
    if (!confirm("Are you sure you want to delete this item?")) return;
    
    const newDeletedFiles = new Set(deletedFiles);
    newDeletedFiles.add(fileId);
    setDeletedFiles(newDeletedFiles);
    setSelectedFile(null);
    
    toast.success("Item deleted successfully");
  };

  // Filter files based on deleted status and current folder
  // Add new state for filter mode
  const [filterMode, setFilterMode] = useState<'all' | 'deleted'>('all');

  // Modified getVisibleFiles function with pagination
  const getVisibleFiles = () => {
    let files = vaultFiles;
    
    // Filter by current folder
    if (openFolder) {
      files = files.filter(file => file.metadata.parentFolderId === openFolder);
    } else {
      files = files.filter(file => !file.metadata.parentFolderId);
    }
    
    // Filter based on mode
    if (filterMode === 'deleted') {
      files = files.filter(file => deletedFiles.has(file.id));
    } else if (!showHiddenFiles) {
      files = files.filter(file => !deletedFiles.has(file.id));
    }
    
    return files;
  };

  // Get paginated files for current page
  const getPaginatedFiles = () => {
    const allFiles = getVisibleFiles();
    const startIndex = currentPage * filesPerPage;
    const endIndex = startIndex + filesPerPage;
    return allFiles.slice(startIndex, endIndex);
  };

  // Get total number of pages
  const getTotalPages = () => {
    const allFiles = getVisibleFiles();
    return Math.ceil(allFiles.length / filesPerPage);
  };

  // Handle page navigation
  const handleNextPage = () => {
    const totalPages = getTotalPages();
    if (currentPage < totalPages - 1) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1);
    }
  };

  // Reset pagination when folder changes
  useEffect(() => {
    setCurrentPage(0);
  }, [openFolder, showHiddenFiles]);

  // Format file size
  const formatFileSize = (size: number) => {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(2)} MB`;
    return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  // Authentication screen
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-white to-blue-50 dark:from-[#191919] dark:to-[#191919] page-transition">
        <Header />
        <main className="pt-28 px-4 sm:px-6 pb-16 max-w-md mx-auto">
          <div className="backdrop-blur-xl bg-white/40 dark:bg-gray-800 border border-white/20 dark:border-gray-700 shadow-lg rounded-xl p-8">
            <div className="text-center mb-8">
              <div className="mx-auto w-16 h-16 bg-orange-100 dark:bg-orange-900/50 rounded-full flex items-center justify-center mb-4">
                <Lock className="w-8 h-8 text-orange-600 dark:text-orange-400" />
              </div>
              <h1 className="text-2xl font-bold dark:text-white mb-2">
                {isFirstTime ? "Create Vault Password" : "Secure Vault"}
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                {isFirstTime 
                  ? "Set up a strong password to protect your vault" 
                  : "Enter your password to access your secure vault"
                }
              </p>
            </div>
            
            <div className="space-y-4">
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder={isFirstTime ? "Create vault password (min 12 chars)" : "Enter vault password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10"
                  onKeyPress={(e) => e.key === 'Enter' && (isFirstTime ? createVaultPassword() : verifyPassword())}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              
              {isFirstTime && (
                <div className="relative">
                  <Input
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Confirm vault password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pr-10"
                    onKeyPress={(e) => e.key === 'Enter' && createVaultPassword()}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  >
                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              )}
              
              {isFirstTime && (
                <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
                  <p>Password requirements:</p>
                  <ul className="list-disc list-inside space-y-0.5 ml-2">
                    <li>At least 12 characters long</li>
                    <li>Contains uppercase and lowercase letters</li>
                    <li>Contains numbers and special characters</li>
                  </ul>
                </div>
              )}
              
              <Button 
                onClick={isFirstTime ? createVaultPassword : verifyPassword}
                disabled={loading || !password || (isFirstTime && !confirmPassword)}
                className="w-full bg-orange-500 hover:bg-orange-600"
              >
                {loading ? "Processing..." : (isFirstTime ? "Create Vault" : "Unlock Vault")}
              </Button>
            </div>
            
            <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-blue-800 dark:text-blue-300">Security Notice</p>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                    {isFirstTime 
                      ? "Your password will be securely hashed and stored locally. Make sure to remember it as it cannot be recovered."
                      : "Your vault is protected with end-to-end encryption. Only you can access your files with the correct password."
                    }
                  </p>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Main vault interface
  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-blue-50 dark:from-[#191919] dark:to-[#191919] page-transition">
      <Header />
      <main className="pt-16 sm:pt-20 lg:pt-28 px-3 sm:px-4 lg:px-6 pb-16 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 sm:mb-6 lg:mb-8 space-y-3 sm:space-y-0">
          <div>
            <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold tracking-tight dark:text-white">Secure Vault</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1 sm:mt-2 text-xs sm:text-sm lg:text-base">Your encrypted file storage</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <Button 
              onClick={() => setShowUploadSection(true)} 
              className="bg-orange-500 hover:bg-orange-600 shadow-lg w-full sm:w-auto text-xs sm:text-sm lg:text-base px-3 sm:px-4"
              size="sm"
            >
              <Upload size={14} className="mr-1 sm:mr-2 sm:size-4" />
              <span className="hidden sm:inline">Upload Files</span>
              <span className="sm:hidden">Upload</span>
            </Button>
            <Button onClick={lockVault} variant="outline" className="w-full sm:w-auto text-xs sm:text-sm lg:text-base px-3 sm:px-4" size="sm">
              <Lock size={14} className="mr-1 sm:mr-2 sm:size-4" />
              <span className="hidden sm:inline">Lock Vault</span>
              <span className="sm:hidden">Lock</span>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 sm:gap-6">
          {/* Main content area */}
          <div className="xl:col-span-3">
            {/* Upload section - replaces vault contents when active */}
            {showUploadSection ? (
              <div className="backdrop-blur-xl bg-white/90 dark:bg-gray-800/90 border border-white/30 dark:border-gray-700/50 shadow-xl rounded-2xl p-3 sm:p-4 lg:p-6 xl:p-8">
                <div className="flex justify-between items-center mb-3 sm:mb-4 lg:mb-6">
                  <h2 className="text-lg sm:text-xl lg:text-2xl font-semibold dark:text-white">Upload Files</h2>
                  <Button onClick={() => {
                    setShowUploadSection(false);
                    setSelectedFiles([]);
                    setTotalSize(0);
                  }} variant="ghost" size="sm">
                    <X size={16} className="sm:size-[18px]" />
                  </Button>
                </div>
                
                {isUploading && (
                  <div className="mb-4 sm:mb-6">
                    <div className="flex justify-between text-xs sm:text-sm mb-2">
                      <span className="text-gray-600 dark:text-gray-400">Storing files...</span>
                      <span className="text-gray-600 dark:text-gray-400">{uploadProgress.toFixed(0)}%</span>
                    </div>
                    <Progress value={uploadProgress} className="h-2 sm:h-3" />
                  </div>
                )}
                
                {selectedFiles.length === 0 ? (
                  <label className="cursor-pointer block">
                    <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-6 sm:p-8 lg:p-12 text-center hover:border-gray-400 hover:bg-gray-50/50 dark:hover:bg-gray-900/10 transition-all duration-200">
                      <div className="mx-auto w-12 h-12 sm:w-16 sm:h-16 bg-gray-100 dark:bg-gray-900/30 rounded-full flex items-center justify-center mb-4 sm:mb-6">
                        <Upload className="w-6 h-6 sm:w-8 sm:h-8 text-gray-600 dark:text-gray-400" />
                      </div>
                      <h3 className="text-base sm:text-lg lg:text-xl font-semibold text-gray-900 dark:text-white mb-2">Drag and drop files, or click to select</h3>
                      <input
                        type="file"
                        multiple
                        onChange={handleFileSelection}
                        className="hidden"
                        disabled={isUploading}
                        id="file-upload-main"
                        webkitdirectory={undefined}
                      />
                    </div>
                  </label>
                ) : selectedFiles.length >= 8 ? (
                  <div className="border-2 border-gray-300 dark:border-gray-600 rounded-xl p-6 bg-gray-50/50 dark:bg-gray-900/10">
                    <div className="text-center">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Maximum Files Reached</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">You have reached the maximum limit of 8 files</p>
                      
                      {/* Circular file display */}
                      <div className="flex flex-wrap justify-center gap-3 mb-6">
                        {selectedFiles.map((file, index) => {
                          const truncatedName = file.name.length > 9 
                            ? file.name.substring(0, 5) + '.' + file.name.split('.').pop()
                            : file.name;
                          
                          return (
                            <div key={index} className="relative group">
                              <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center border-2 border-gray-200 dark:border-gray-600">
                                <File className="w-6 h-6 text-gray-600 dark:text-gray-400" />
                              </div>
                              <button
                                onClick={() => {
                                  const newFiles = selectedFiles.filter((_, i) => i !== index);
                                  setSelectedFiles(newFiles);
                                  setTotalSize(newFiles.reduce((total, f) => total + f.size, 0));
                                }}
                                className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                ×
                              </button>
                              <p className="text-xs text-center mt-1 text-gray-600 dark:text-gray-400 truncate w-16" title={file.name}>
                                {truncatedName}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                      
                      <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          Storage cost: ${serviceFee} USD
                        </div>
                        <Button 
                          onClick={storeFiles}
                          className="bg-orange-500 hover:bg-orange-600 shadow-lg px-8 py-2"
                          disabled={isUploading || selectedFiles.length === 0}
                        >
                          <Upload size={18} className="mr-2" />
                          Store Files
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-6 bg-gray-50/50 dark:bg-gray-900/10">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Selected Files ({selectedFiles.length}/8)</h3>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          Total size: {formatFileSize(totalSize)} / 5GB
                        </div>
                      </div>
                      
                      {/* Circular file display with plus button */}
                      <div className="flex flex-wrap justify-center gap-3 mb-6">
                        {selectedFiles.map((file, index) => {
                          const truncatedName = file.name.length > 9 
                            ? file.name.substring(0, 5) + '.' + file.name.split('.').pop()
                            : file.name;
                          
                          return (
                            <div key={index} className="relative group">
                              <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center border-2 border-gray-200 dark:border-gray-600">
                                <File className="w-6 h-6 text-gray-600 dark:text-gray-400" />
                              </div>
                              <button
                                onClick={() => {
                                  const newFiles = selectedFiles.filter((_, i) => i !== index);
                                  setSelectedFiles(newFiles);
                                  setTotalSize(newFiles.reduce((total, f) => total + f.size, 0));
                                }}
                                className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                ×
                              </button>
                              <p className="text-xs text-center mt-1 text-gray-600 dark:text-gray-400 truncate w-16" title={file.name}>
                                {truncatedName}
                              </p>
                            </div>
                          );
                        })}
                        
                        {/* Plus button for adding more files */}
                        {selectedFiles.length < 8 && (
                          <label className="cursor-pointer">
                            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all">
                              <Plus className="w-6 h-6 text-gray-600 dark:text-gray-400" />
                            </div>
                            <input
                              type="file"
                              multiple
                              onChange={handleAdditionalFileSelection}
                              className="hidden"
                              disabled={isUploading}
                              id="file-upload-additional"
                            />
                            <p className="text-xs text-center mt-1 text-gray-600 dark:text-gray-400">
                              Add
                            </p>
                          </label>
                        )}
                      </div>
                      
                      <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          Storage cost: ${serviceFee} USD
                        </div>
                        <Button 
                          onClick={storeFiles}
                          className="bg-orange-500 hover:bg-orange-600 shadow-lg px-8 py-2"
                          disabled={isUploading || selectedFiles.length === 0}
                        >
                          <Upload size={18} className="mr-2" />
                          Store Files
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Vault contents - only shown when upload section is hidden */
              <div className="backdrop-blur-xl bg-white/90 dark:bg-gray-800/90 border border-white/30 dark:border-gray-700/50 shadow-xl rounded-2xl p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 sm:mb-6 space-y-4 sm:space-y-0">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                    <h2 className="text-xl sm:text-2xl font-semibold dark:text-white">Vault Contents</h2>
                    {folderStack.length > 0 && (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={goBack}
                          className="h-8 text-xs sm:text-sm"
                        >
                          <ArrowLeft size={14} className="mr-1" />
                          Back
                        </Button>
                        <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 truncate max-w-[200px]">
                          {folderStack.map(folder => folder.name).join(' / ')}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                      className="h-8 text-xs sm:text-sm px-2 sm:px-3"
                    >
                      {viewMode === 'grid' ? <List size={14} className="mr-1" /> : <Grid size={14} className="mr-1" />}
                      <span className="hidden sm:inline">{viewMode === 'grid' ? 'List' : 'Grid'}</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowHiddenFiles(!showHiddenFiles)}
                      className={`h-8 text-xs sm:text-sm px-2 sm:px-3 ${showHiddenFiles ? 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400' : ''}`}
                    >
                      {showHiddenFiles ? <EyeOff size={14} className="mr-1" /> : <Eye size={14} className="mr-1" />}
                      <span className="hidden sm:inline">{showHiddenFiles ? 'Hide' : 'Show'}</span>
                    </Button>
                  </div>
                </div>
                
                {getVisibleFiles().length === 0 ? (
                  <div className="text-center py-16">
                    <div className="mx-auto w-20 h-20 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 rounded-2xl flex items-center justify-center mb-6 shadow-lg">
                      <File className="w-10 h-10 text-gray-400" />
                    </div>
                    <h3 className="text-xl font-medium text-gray-900 dark:text-white mb-3">Your vault is empty</h3>
                    <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto">Upload files to get started with secure, encrypted storage on the blockchain</p>
                  </div>
                ) : (
                  viewMode === 'grid' ? (
                    /* Grid View */
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 sm:gap-4 lg:gap-6">
                      {getPaginatedFiles().map((file) => {
                        const isDeleted = deletedFiles.has(file.id);
                        
                        // Create truncated filename (first 5 letters + extension)
                        const fileName = file.metadata.name;
                        const lastDotIndex = fileName.lastIndexOf('.');
                        const nameWithoutExt = lastDotIndex > 0 ? fileName.substring(0, lastDotIndex) : fileName;
                        const extension = lastDotIndex > 0 ? fileName.substring(lastDotIndex) : '';
                        const truncatedName = nameWithoutExt.length > 5 
                          ? `${nameWithoutExt.substring(0, 5)}${extension}`
                          : fileName;
                        
                        // Format date
                        const uploadDate = new Date(file.metadata.timestamp).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        });
                        
                        return (
                          <div 
                            key={file.id} 
                            className={`group relative bg-white/90 dark:bg-gray-800/90 rounded-2xl border border-white/40 dark:border-gray-600/40 hover:shadow-xl hover:border-orange-200 dark:hover:border-orange-600/50 transition-all duration-300 cursor-pointer overflow-hidden backdrop-blur-sm aspect-[4/5] flex flex-col ${
                              isDeleted ? 'opacity-50 bg-red-50/80 dark:bg-red-900/20' : ''
                            }`}
                            onDoubleClick={() => {
                              if (file.metadata.type === "folder") {
                                openFolderHandler(file.metadata.documentId, file.metadata.name);
                              }
                            }}
                          >
                            {/* File Icon */}
                            <div className="flex-1 flex items-center justify-center p-6">
                              <div className="w-20 h-20 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
                                {file.metadata.type === "folder" ? (
                                  <Folder className="w-10 h-10 text-blue-600 dark:text-blue-400" />
                                ) : (
                                  <File className="w-10 h-10 text-gray-600 dark:text-gray-400" />
                                )}
                              </div>
                            </div>
                            
                            {/* File Info */}
                            <div className="px-4 pb-4">
                              {/* File details on left, three dots on right */}
                              <div className="flex items-start justify-between">
                                <div className="flex-1 space-y-1">
                                  {/* File name */}
                                  <h4 className="font-semibold dark:text-white text-sm leading-tight" title={file.metadata.name}>
                                    {truncatedName}
                                  </h4>
                                  
                                  {/* Date */}
                                  <p className="text-xs text-gray-500 dark:text-gray-400">
                                    {uploadDate}
                                  </p>
                                </div>
                                
                                {/* Three dots button - directly opens dialog */}
                                <button 
                                  className="flex items-center justify-center w-7 h-7 rounded-full hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors ml-2 flex-shrink-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    // Directly open file details dialog
                                    setSelectedFileDetails(file);
                                    setShowFileDetailsDialog(true);
                                  }}
                                >
                                  <div className="flex gap-0.5">
                                    <div className="w-1 h-1 bg-gray-500 rounded-full"></div>
                                    <div className="w-1 h-1 bg-gray-500 rounded-full"></div>
                                    <div className="w-1 h-1 bg-gray-500 rounded-full"></div>
                                  </div>
                                </button>
                              </div>
                              
                              {isDeleted && (
                                <div className="absolute top-2 right-2">
                                  <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full font-medium shadow-sm">
                                    Deleted
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    /* List View */
                    <div className="space-y-2">
                      {getPaginatedFiles().map((file) => {
                        const isDeleted = deletedFiles.has(file.id);
                        
                        // Create truncated filename (first 5 letters + extension)
                        const fileName = file.metadata.name;
                        const lastDotIndex = fileName.lastIndexOf('.');
                        const nameWithoutExt = lastDotIndex > 0 ? fileName.substring(0, lastDotIndex) : fileName;
                        const extension = lastDotIndex > 0 ? fileName.substring(lastDotIndex) : '';
                        const truncatedName = nameWithoutExt.length > 5 
                          ? `${nameWithoutExt.substring(0, 5)}${extension}`
                          : fileName;
                        
                        // Format date
                        const uploadDate = new Date(file.metadata.timestamp).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        });
                        
                        return (
                          <div 
                            key={file.id} 
                            className={`group relative bg-white/90 dark:bg-gray-800/90 rounded-xl border border-white/40 dark:border-gray-600/40 hover:shadow-lg hover:border-orange-200 dark:hover:border-orange-600/50 transition-all duration-300 cursor-pointer overflow-hidden backdrop-blur-sm p-4 ${
                              isDeleted ? 'opacity-50 bg-red-50/80 dark:bg-red-900/20' : ''
                            }`}
                            onDoubleClick={() => {
                              if (file.metadata.type === "folder") {
                                openFolderHandler(file.metadata.documentId, file.metadata.name);
                              }
                            }}
                          >
                            <div className="flex items-center space-x-4">
                              {/* File Icon */}
                              <div className="flex-shrink-0">
                                <div className="w-12 h-12 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 rounded-xl flex items-center justify-center shadow-md group-hover:scale-105 transition-transform duration-300">
                                  {file.metadata.type === "folder" ? (
                                    <Folder className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                                  ) : (
                                    <File className="w-6 h-6 text-gray-600 dark:text-gray-400" />
                                  )}
                                </div>
                              </div>
                              
                              {/* File Info */}
                              <div className="flex-1 min-w-0">
                                {/* File name */}
                                <h4 className="font-semibold dark:text-white text-sm leading-tight truncate" title={file.metadata.name}>
                                  {truncatedName}
                                </h4>
                                
                                {/* Date and three dots on bottom line */}
                                <div className="flex items-center justify-between mt-1">
                                  <p className="text-xs text-gray-500 dark:text-gray-400">
                                    {uploadDate}
                                  </p>
                                  
                                  {/* Three dots button - directly opens dialog */}
                                  <button 
                                    className="flex items-center justify-center w-6 h-6 rounded-full hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors flex-shrink-0"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      // Directly open file details dialog
                                      setSelectedFileDetails(file);
                                      setShowFileDetailsDialog(true);
                                    }}
                                  >
                                    <div className="flex gap-0.5">
                                      <div className="w-1 h-1 bg-gray-500 rounded-full"></div>
                                      <div className="w-1 h-1 bg-gray-500 rounded-full"></div>
                                      <div className="w-1 h-1 bg-gray-500 rounded-full"></div>
                                    </div>
                                  </button>
                                </div>
                              </div>
                            </div>
                            
                            {isDeleted && (
                              <div className="absolute top-2 right-2">
                                <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full font-medium shadow-sm">
                                  Deleted
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )
                )}
                
                {/* Pagination Controls */}
                {getVisibleFiles().length > 0 && (
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mt-4 sm:mt-6 px-2 sm:px-4 space-y-3 sm:space-y-0">
                    <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 text-center sm:text-left">
                      Showing {currentPage * filesPerPage + 1}-{Math.min((currentPage + 1) * filesPerPage, getVisibleFiles().length)} of {getVisibleFiles().length} files
                    </div>
                    
                    <div className="flex items-center justify-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handlePrevPage}
                        disabled={currentPage === 0}
                        className="px-2 sm:px-3 py-1 text-xs sm:text-sm"
                      >
                        <span className="hidden sm:inline">Previous</span>
                        <span className="sm:hidden">Prev</span>
                      </Button>
                      
                      <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 px-1 sm:px-2">
                        {currentPage + 1}/{getTotalPages()}
                      </span>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleNextPage}
                        disabled={currentPage >= getTotalPages() - 1}
                        className="px-2 sm:px-3 py-1 text-xs sm:text-sm"
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Enhanced Sidebar - Made smaller with hover effects */}
          <div className="space-y-3 sm:space-y-4">
            <div className="backdrop-blur-xl bg-white/90 dark:bg-gray-800/90 border border-white/30 dark:border-gray-700/50 shadow-xl rounded-2xl p-3 sm:p-4 transition-all duration-300 hover:scale-105 hover:shadow-2xl">
              <h3 className="text-sm sm:text-base font-semibold mb-2 sm:mb-3 dark:text-white">Vault Statistics</h3>
              <div className="space-y-2 sm:space-y-3">
                <div 
                  className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-700/20 dark:to-gray-600/20 rounded-lg p-3 cursor-pointer transition-all duration-200 hover:scale-105 hover:shadow-md flex items-center justify-between"
                  onClick={() => {
                    setFilterMode('all');
                    setShowHiddenFiles(false);
                  }}
                >
                  <p className="text-xs text-gray-600 dark:text-gray-400">Files Stored</p>
                  <p className="text-xl font-bold text-black dark:text-white">{vaultFiles.filter(file => !deletedFiles.has(file.id)).length}</p>
                </div>
                <div className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-700/20 dark:to-gray-600/20 rounded-lg p-3 transition-all duration-200 hover:scale-105 hover:shadow-md flex items-center justify-between">
                  <p className="text-xs text-gray-600 dark:text-gray-400">Total Size</p>
                  <p className="text-lg font-bold text-black dark:text-white">
                    {formatFileSize(vaultFiles.filter(file => !deletedFiles.has(file.id)).reduce((acc, file) => acc + file.metadata.size, 0))}
                  </p>
                </div>
                {deletedFiles.size > 0 && (
                  <div 
                    className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-700/20 dark:to-gray-600/20 rounded-lg p-3 cursor-pointer transition-all duration-200 hover:scale-105 hover:shadow-md flex items-center justify-between"
                    onClick={() => {
                      setFilterMode('deleted');
                      setShowHiddenFiles(true);
                    }}
                  >
                    <p className="text-xs text-gray-600 dark:text-gray-400">Deleted Files</p>
                    <p className="text-lg font-bold text-black dark:text-white">{deletedFiles.size}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="backdrop-blur-xl bg-white/90 dark:bg-gray-800/90 border border-white/30 dark:border-gray-700/50 shadow-xl rounded-2xl p-4 transition-all duration-300 hover:scale-105 hover:shadow-2xl">
              <h3 className="text-base font-semibold mb-3 dark:text-white">Security Features</h3>
              <ul className="space-y-2">
                <li className="flex items-center gap-2 text-xs dark:text-gray-300">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full shadow-sm"></div>
                  End-to-End Encryption
                </li>
                <li className="flex items-center gap-2 text-xs dark:text-gray-300">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full shadow-sm"></div>
                  Password Protected
                </li>
                <li className="flex items-center gap-2 text-xs dark:text-gray-300">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full shadow-sm"></div>
                  Blockchain Storage
                </li>
                <li className="flex items-center gap-2 text-xs dark:text-gray-300">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full shadow-sm"></div>
                  Immutable Records
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Payment Dialog */}
        {showPaymentDialog && (
          <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-center w-full">Vault Storage Payment</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="text-center">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    To store these files securely in your vault, a service fee is required.
                  </p>
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 mb-4">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Service Fee</p>
                    <p className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                      {serviceFee ? `$${serviceFee} USDC` : 'Calculating...'}
                    </p>
                    {fileSizeTier && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {fileSizeTier} • {(getTotalFileSize() / 1024 / 1024).toFixed(2)} MB
                      </p>
                    )}
                  </div>
                </div>
                
                {paymentStatus === 'error' && paymentError && (
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                    <p className="text-sm text-red-600 dark:text-red-400">{paymentError}</p>
                  </div>
                )}
                
                {isUploading ? (
                  <div className="flex items-center justify-center py-3">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                    <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">Processing...</span>
                  </div>
                ) : (
                  <div className="flex justify-center">
                    <Checkout 
                      chargeHandler={chargeHandler}
                      onStatus={(status: { statusName: string; statusData?: any }) => {
                        console.log('Payment status update:', status);
                        const { statusName, statusData } = status;
                        
                        try {
                          if (statusName === 'success') {
                            console.log('Payment successful, starting upload...');
                            setPaymentStatus('success');
                            setPaymentError(null);
                            setShowPaymentDialog(false);
                            toast.success('Payment successful! Uploading files...');
                            handlePostPaymentUpload();
                          } else if (statusName === 'error') {
                            console.error('Payment error:', status);
                            setPaymentStatus('error');
                            setPaymentError(
                              (statusData as { message?: string })?.message || 
                              'Payment failed. Please try again.'
                            );
                            toast.error('Payment failed. Please try again.');
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
                        disabled={!address}
                      />
                      <CheckoutStatus />
                    </Checkout>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* File Details Dialog */}
        {showFileDetailsDialog && selectedFileDetails && (
          <Dialog open={showFileDetailsDialog} onOpenChange={setShowFileDetailsDialog}>
            <DialogContent className="sm:max-w-lg backdrop-blur-xl bg-white/95 dark:bg-gray-900/95 border border-white/20 dark:border-gray-700/50">
              <DialogHeader>
                <DialogTitle className="text-center w-full text-lg font-semibold">File Details</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col items-center space-y-6 p-4">
                {/* Large File Icon */}
                <div className="w-24 h-24 bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-800 dark:to-blue-900 rounded-2xl flex items-center justify-center shadow-lg">
                  {selectedFileDetails.metadata.type === "folder" ? (
                    <Folder className="w-12 h-12 text-blue-600 dark:text-blue-400" />
                  ) : (
                    <File className="w-12 h-12 text-gray-600 dark:text-gray-400" />
                  )}
                </div>
                
                {/* File Details */}
                <div className="w-full space-y-4">
                  <div className="text-center">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                      {selectedFileDetails.metadata.name}
                    </h3>
                  </div>
                  
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between items-center py-2 border-b border-gray-200 dark:border-gray-700">
                      <span className="text-gray-600 dark:text-gray-400">Time Sent:</span>
                      <span className="text-gray-900 dark:text-white font-medium">
                        {new Date(selectedFileDetails.metadata.timestamp).toLocaleString()}
                      </span>
                    </div>
                    
                    <div className="flex justify-between items-center py-2 border-b border-gray-200 dark:border-gray-700">
                      <span className="text-gray-600 dark:text-gray-400">Sender:</span>
                      <span className="text-gray-900 dark:text-white font-medium">
                        {selectedFileDetails.metadata.sender || 'You'}
                      </span>
                    </div>
                    
                    <div className="flex justify-between items-center py-2 border-b border-gray-200 dark:border-gray-700">
                      <span className="text-gray-600 dark:text-gray-400">Size:</span>
                      <span className="text-gray-900 dark:text-white font-medium">
                        {selectedFileDetails.metadata.type === "folder" ? "Folder" : formatFileSize(selectedFileDetails.metadata.size)}
                      </span>
                    </div>
                    
                    <div className="flex justify-between items-center py-2 border-b border-gray-200 dark:border-gray-700">
                      <span className="text-gray-600 dark:text-gray-400">Transaction (TX):</span>
                      <span className="text-blue-600 dark:text-blue-400 font-medium cursor-pointer hover:underline" 
                            onClick={() => window.open(`https://viewblock.io/arweave/tx/${selectedFileDetails.metadata.transactionId || 'N/A'}`, '_blank')}>
                        {selectedFileDetails.metadata.transactionId ? 
                          `${selectedFileDetails.metadata.transactionId.substring(0, 8)}...` : 
                          'N/A'
                        }
                      </span>
                    </div>
                  </div>
                  
                  {/* Download Button */}
                  <div className="pt-4">
                    <button
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                      onClick={() => {
                        if (selectedFileDetails.metadata.type === "folder") {
                          downloadFolder(selectedFileDetails.metadata.documentId, selectedFileDetails.metadata.name);
                        } else {
                          downloadFile(selectedFileDetails);
                        }
                        setShowFileDetailsDialog(false);
                      }}
                    >
                      <Download size={16} />
                      Download
                    </button>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </main>
    </div>
  );
};

export default Vault;