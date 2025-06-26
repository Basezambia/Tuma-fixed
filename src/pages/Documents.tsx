import React, { useState, useEffect } from 'react';
import { ArrowDownToLine, ArrowUpToLine, File, FilePenLine, FileSearch, Folder, Search, AlertCircle, Grid, List, ExternalLink, MoreVertical } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import Header from "@/components/Header";
import { arweaveService, StoredFile } from "@/lib/arweave-service";
import { useAccount } from 'wagmi';
import { decryptFileBufferHKDF, decryptFileForMultipleRecipients, decryptMetadata } from '../lib/encryption';
import { format as formatDateFns } from 'date-fns';
import { fetchPaymentStatus, PaymentStatus } from "@/lib/payment-status";
import { useLocation, useNavigate } from 'react-router-dom';

interface FileWithPayment extends StoredFile {
  isPaid?: boolean;
}

const Documents = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [receivedDocs, setReceivedDocs] = useState<FileWithPayment[]>([]);
  const [sentDocs, setSentDocs] = useState<FileWithPayment[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paymentStatuses, setPaymentStatuses] = useState<Record<string, PaymentStatus>>({});
  const [statusLoading, setStatusLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('received');

  // Get user's Ethereum address and location
  const { address: userAddress } = useAccount();
  const location = useLocation();
  const navigate = useNavigate();

  // Handle URL parameters for tab selection
  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const tab = urlParams.get('tab');
    if (tab === 'sent' || tab === 'received') {
      setActiveTab(tab);
    }
  }, [location.search]);

  // Listen for new sent files (for instant feedback after sending)
  useEffect(() => {
    const handler = (e: any) => {
      if (e.detail && e.detail.metadata && e.detail.metadata.sender && e.detail.metadata.sender.toLowerCase() === userAddress?.toLowerCase()) {
        setSentDocs(prev => [{ id: e.detail.id, metadata: e.detail.metadata }, ...prev]);
      }
    };
    window.addEventListener('tuma:newSentFile', handler);
    return () => window.removeEventListener('tuma:newSentFile', handler);
  }, [userAddress]);

  // Fetch documents from Arweave
  useEffect(() => {
    const fetchDocuments = async () => {
      try {
        setLoading(true);
        setError(null);
        // Around line 45-50, after fetching files:
        const received = await arweaveService.getReceivedFiles(userAddress?.toLowerCase() || "");
        const sent = await arweaveService.getSentFiles(userAddress?.toLowerCase() || "");
        
        // Check for new received files and emit events
        const previousReceivedIds = receivedDocs.map(doc => doc.id);
        const newReceivedFiles = received.filter(doc => !previousReceivedIds.includes(doc.id));
        
        newReceivedFiles.forEach(file => {
          // Emit event for new received file
          const event = new CustomEvent('tuma:newReceivedFile', {
            detail: { id: file.id, metadata: file.metadata }
          });
          window.dispatchEvent(event);
        });
        
        // Filter out vault files from both received and sent documents
        const filteredReceived = received.filter(file => 
          !file.metadata.description?.includes("[VAULT]") &&
          !file.metadata.documentId?.startsWith("vault_")
        );
        
        const filteredSent = sent.filter(file => 
          !file.metadata.description?.includes("[VAULT]") &&
          !file.metadata.documentId?.startsWith("vault_")
        );
        
        setReceivedDocs(filteredReceived);
        setSentDocs(filteredSent);
        
        // After fetching, fetch payment statuses for all docs with chargeId
        const allDocs = [...filteredReceived, ...filteredSent];
        const statusMap: Record<string, PaymentStatus> = {};
        setStatusLoading(true);
        await Promise.all(allDocs.map(async (doc) => {
          const chargeId = doc.metadata.chargeId;
          if (chargeId) {
            statusMap[doc.id] = await fetchPaymentStatus(chargeId);
          } else {
            statusMap[doc.id] = 'success'; // If no chargeId, treat as paid (legacy)
          }
        }));
        setPaymentStatuses(statusMap);
        setStatusLoading(false);
      } catch (error) {
        console.error("Error fetching documents:", error);
        setError("Failed to fetch documents. Please try again later.");
      } finally {
        setLoading(false);
      }
    };
    if (userAddress) fetchDocuments();
  }, [userAddress]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (openDropdown && !(event.target as Element).closest('.relative')) {
        setOpenDropdown(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [openDropdown]);

  // Format date from timestamp
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    
    // If today, show "Today"
    if (date.toDateString() === now.toDateString()) {
      return "Today";
    }
    
    // If yesterday, show "Yesterday"
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return "Yesterday";
    }
    
    // Otherwise, show formatted date
    return formatDateFns(date, "MMM d, yyyy");
  };

  // Format file size
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


  // Helper: get Arweave gateway URL for a file
  const getArweaveUrl = (txid: string) => `https://arweave.net/${txid}`;
  const getArioUrl = (txid: string) => `https://g8way.io/${txid}`;

  // Helper: convert Uint8Array to base64 safely without using spread operator
  const uint8ArrayToBase64 = (bytes: Uint8Array): string => {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  // --- Improved Decryption/Download Error Handling ---
  const downloadFile = async (docId: string, fileName: string, iv: string, sender: string, recipient: string) => {
    try {
      const { data, metadata } = await arweaveService.getFile(docId);
      if (!userAddress) throw new Error('Wallet not connected');
      
      const isSender = typeof sender === 'string' && typeof userAddress === 'string' && userAddress.toLowerCase() === sender.toLowerCase();
      
      // Check if user is among recipients (handle both single recipient and multiple recipients)
      let isRecipient = false;
      if (typeof recipient === 'string' && typeof userAddress === 'string') {
        isRecipient = userAddress.toLowerCase() === recipient.toLowerCase();
      }
      
      // Also check if user is in the recipients array from metadata
      if (!isRecipient && metadata.recipients && Array.isArray(metadata.recipients)) {
        isRecipient = metadata.recipients.some((r: any) => 
          typeof r === 'string' ? r.toLowerCase() === userAddress.toLowerCase() : 
          r && typeof r === 'object' && r.address && r.address.toLowerCase() === userAddress.toLowerCase()
        );
      }
      
      if (!isSender && !isRecipient) {
        throw new Error('You do not have permission to decrypt this file');
      }
      
      // Convert data to string for parsing
      let dataString: string;
      if (data instanceof Uint8Array) {
        dataString = new TextDecoder().decode(data);
      } else if (typeof data === 'string') {
        dataString = data;
      } else {
        throw new Error('Unsupported data type for decryption');
      }
      
      let decrypted: Uint8Array;
      
      try {
        // Try to parse as new multi-recipient format
        const payload = JSON.parse(dataString);
        
        if (payload.ciphertext && payload.iv && payload.metadata) {
          // New multi-recipient format
          const userKey = userAddress.toLowerCase();
          
          // Try to find the user's metadata with flexible key matching
          let userMetadata = payload.metadata[userKey];
          
          // If not found, try other variations
          if (!userMetadata) {
            // Try original case
            userMetadata = payload.metadata[userAddress];
          }
          
          if (!userMetadata) {
            // Try to find any key that matches (case-insensitive)
            const metadataKeys = Object.keys(payload.metadata);
            const matchingKey = metadataKeys.find(key => 
              key.toLowerCase() === userAddress.toLowerCase()
            );
            if (matchingKey) {
              userMetadata = payload.metadata[matchingKey];
            }
          }
          
          if (!userMetadata) {
            throw new Error('No encrypted metadata found for this user. You may not have permission to decrypt this file.');
          }
          
          // Decrypt metadata to get recipient keys
          const decryptedMetadata = await decryptMetadata(
            userMetadata,
            sender.toLowerCase(),
            userAddress.toLowerCase(),
            metadata.documentId || docId
          );
          
          // Use the new multi-recipient decryption
          decrypted = await decryptFileForMultipleRecipients(
            payload.ciphertext,
            payload.iv,
            decryptedMetadata.recipientKeys,
            sender.toLowerCase(),
            userAddress.toLowerCase(),
            metadata.documentId || docId
          );
          
          // Verify SHA-256 if available in decrypted metadata
          if (decryptedMetadata.sha256) {
            const hashBuffer = await crypto.subtle.digest('SHA-256', Uint8Array.from(atob(payload.ciphertext), c => c.charCodeAt(0)));
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const sha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            if (sha256 !== decryptedMetadata.sha256) {
              toast.error('Integrity check failed: File hash does not match. Download aborted.');
              return;
            }
          }
        } else {
          throw new Error('Invalid payload format');
        }
      } catch (parseError) {
        // Fallback to legacy single-recipient format
        if (!iv) throw new Error('Missing IV for decryption');
        
        const ciphertextBase64 = data instanceof Uint8Array ? uint8ArrayToBase64(data) : btoa(dataString);
        
        // SHA-256 integrity check for legacy format
        if (metadata && metadata.sha256) {
          const hashBuffer = await crypto.subtle.digest('SHA-256', Uint8Array.from(atob(ciphertextBase64), c => c.charCodeAt(0)));
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          const sha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
          if (sha256 !== metadata.sha256) {
            toast.error('Integrity check failed: File hash does not match. Download aborted.');
            return;
          }
        }
        
        // Use legacy HKDF-based decryption
        const salt = metadata.documentId || docId;
        decrypted = await decryptFileBufferHKDF(
          ciphertextBase64,
          iv,
          sender.toLowerCase(),
          userAddress.toLowerCase(),
          salt
        );
      }
      
      const blob = new Blob([decrypted], { type: metadata.type || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success('File decrypted and downloaded!');
      
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Download failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  // --- Sorting and Pagination State ---
  const [sortKey, setSortKey] = useState<'date-desc'|'date-asc'|'name-asc'|'name-desc'|'size-asc'|'size-desc'>('date-desc');
  const [receivedPage, setReceivedPage] = useState(1);
  const [sentPage, setSentPage] = useState(1);
  const PAGE_SIZE = 10;

  // --- Sorting Functions ---
  function sortDocs(docs: FileWithPayment[], key: typeof sortKey) {
    return [...docs].sort((a, b) => {
      if (key === 'date-desc') return b.metadata.timestamp - a.metadata.timestamp;
      if (key === 'date-asc') return a.metadata.timestamp - b.metadata.timestamp;
      if (key === 'name-asc') return a.metadata.name.localeCompare(b.metadata.name);
      if (key === 'name-desc') return b.metadata.name.localeCompare(a.metadata.name);
      if (key === 'size-asc') return a.metadata.size - b.metadata.size;
      if (key === 'size-desc') return b.metadata.size - a.metadata.size;
      return 0;
    });
  }

  // --- Filtered, Sorted, and Paginated Results ---
  const filteredReceived = receivedDocs.filter(doc => {
    const status = paymentStatuses[doc.id];
    return (
      doc.metadata.sender.toLowerCase() !== userAddress?.toLowerCase() &&
      (typeof doc.metadata.name === 'string' && doc.metadata.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      typeof doc.metadata.sender === 'string' && doc.metadata.sender.toLowerCase().includes(searchQuery.toLowerCase())) &&
      status === 'success'
    );
  });
  const sortedReceived = sortDocs(filteredReceived, sortKey);
  const paginatedReceived = sortedReceived.slice((receivedPage-1)*PAGE_SIZE, receivedPage*PAGE_SIZE);

  const filteredSent = sentDocs.filter(doc => {
    const status = paymentStatuses[doc.id];
    return (
      (typeof doc.metadata.name === 'string' && doc.metadata.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      typeof doc.metadata.recipient === 'string' && doc.metadata.recipient.toLowerCase().includes(searchQuery.toLowerCase())) &&
      status === 'success'
    );
  });
  const sortedSent = sortDocs(filteredSent, sortKey);
  const paginatedSent = sortedSent.slice((sentPage-1)*PAGE_SIZE, sentPage*PAGE_SIZE);

  // --- Pagination Controls ---
  function Pagination({ page, setPage, total }: { page: number, setPage: (p:number)=>void, total: number }) {
    const lastPage = Math.ceil(total/PAGE_SIZE);
    if (lastPage <= 1) return null;
    return (
      <div className="flex justify-end items-center gap-2 mt-4 bg-white dark:bg-[#191919] rounded-lg p-2">
        <button disabled={page === 1} onClick={()=>setPage(page-1)} className="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors">Prev</button>
        <span className="text-sm">Page {page} of {lastPage}</span>
        <button disabled={page === lastPage} onClick={()=>setPage(page+1)} className="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors">Next</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-blue-50 dark:from-[#191919] dark:to-[#191919] page-transition">
      <Header />
      
      <main className="pt-28 px-6 pb-16 max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">Your Files</h1>
          <p className="text-doc-medium-gray">View and manage all your sent and received files</p>
        </div>
        
        <div className="glass-panel p-6">
          <div className="flex flex-col md:flex-row justify-between gap-4 mb-6">
            <div className="relative max-w-md w-full">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search size={18} className="text-doc-medium-gray" />
              </div>
              <input
                type="text"
                placeholder="Search files..."
                className="pl-10 pr-4 py-2 w-full border-none bg-white dark:bg-gray-700 bg-opacity-80 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-gray-800 dark:text-white"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-1">
                <span className="text-sm text-doc-medium-gray mr-2">Sort by:</span>
                <select
                  className="bg-white dark:bg-gray-700 bg-opacity-80 rounded-lg border-none px-3 py-2 text-sm text-gray-800 dark:text-white focus:ring-1 focus:ring-blue-500 outline-none"
                  value={sortKey}
                  onChange={e => setSortKey(e.target.value as typeof sortKey)}
                >
                  <option value="date-desc">Date (Newest)</option>
                  <option value="date-asc">Date (Oldest)</option>
                  <option value="name-asc">Name (A-Z)</option>
                  <option value="name-desc">Name (Z-A)</option>
                  <option value="size-desc">Size (Largest)</option>
                  <option value="size-asc">Size (Smallest)</option>
                </select>
              </div>
              <div className="flex items-center gap-1 bg-white dark:bg-gray-700 bg-opacity-80 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded transition-colors ${
                    viewMode === 'list'
                      ? 'bg-blue-500 text-white'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                  title="List view"
                >
                  <List size={16} />
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded transition-colors ${
                    viewMode === 'grid'
                      ? 'bg-blue-500 text-white'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                  title="Grid view"
                >
                  <Grid size={16} />
                </button>
              </div>
            </div>
          </div>
          
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full dark:bg-gray-900 dark:p-4 dark:rounded-lg">
            <TabsList className="mb-6">
              <TabsTrigger value="received" className="flex items-center gap-2">
                <ArrowDownToLine size={16} />
                <span>Received</span>
                <span className="ml-1 bg-doc-soft-blue text-doc-deep-blue text-xs px-1.5 py-0.5 rounded-full">
                  {receivedDocs.length}
                </span>
              </TabsTrigger>
              <TabsTrigger value="sent" className="flex items-center gap-2">
                <ArrowUpToLine size={16} />
                <span>Sent</span>
                <span className="ml-1 bg-doc-soft-blue text-doc-deep-blue text-xs px-1.5 py-0.5 rounded-full">
                  {sentDocs.length}
                </span>
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="received" className="mt-0 dark:bg-gray-900">
              {loading ? (
                <div className="py-12 text-center">
                  <div className="animate-spin mx-auto h-12 w-12 border-4 border-doc-deep-blue border-t-transparent rounded-full"></div>
                  <h3 className="mt-4 text-lg font-medium">Loading files...</h3>
                </div>
              ) : error ? (
                <div className="py-12 text-center">
                  <AlertCircle className="mx-auto h-12 w-12 text-red-500 opacity-80" />
                  <h3 className="mt-4 text-lg font-medium">Error loading files</h3>
                  <p className="mt-1 text-doc-medium-gray">{error}</p>
                </div>
              ) : filteredReceived.length > 0 ? (
                <div className="bg-white dark:bg-[#191919]">
                  {viewMode === 'list' ? (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-gray-200 dark:border-[#232323] bg-gray-100 dark:bg-[#191919]">
                            <th className="text-left py-3 px-4 font-medium text-doc-medium-gray">Name</th>
                            <th className="text-left py-3 px-4 font-medium text-doc-medium-gray">Sender</th>
                            <th className="text-left py-3 px-4 font-medium text-doc-medium-gray">Date</th>
                            <th className="text-left py-3 px-4 font-medium text-doc-medium-gray">Size</th>
                            <th className="text-left py-3 px-4 font-medium text-doc-medium-gray">Description</th>
                            <th className="text-left py-3 px-4 font-medium text-doc-medium-gray">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedReceived.map((doc) => (
                            <tr 
                              key={doc.id}
                              className="file-row bg-white dark:bg-[#191919] hover:bg-gray-100 dark:hover:bg-[#232323] border-b border-gray-200 dark:border-[#232323] transition-colors duration-150"
                            >
                              <td className="py-3 px-4">
                                <div className="flex items-center">
                                  <DocumentIcon type={doc.metadata.type.split('/')[1] || 'file'} />
                                  <span className="ml-3 font-medium">{doc.metadata.name}</span>
                                </div>
                              </td>
                              <td className="py-3 px-4 text-doc-medium-gray">
                                {doc.metadata.sender.slice(0, 6)}...{doc.metadata.sender.slice(-4)}
                              </td>
                              <td className="py-3 px-4 text-doc-medium-gray">
                                {formatDate(doc.metadata.timestamp)}
                              </td>
                              <td className="py-3 px-4 text-doc-medium-gray">
                                {formatFileSize(doc.metadata.size)}
                              </td>
                              <td className="py-3 px-4 text-doc-medium-gray max-w-xs truncate" title={doc.metadata.description || ''}>
                                {doc.metadata.description || <span className="text-gray-300 italic">-</span>}
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex space-x-2">
                                  <button 
                                    className="p-1.5 rounded-full hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors text-doc-deep-blue"
                                    title="View document"
                                    onClick={() => downloadFile(doc.id, doc.metadata.name, doc.metadata.iv, doc.metadata.sender, doc.metadata.recipient)}
                                  >
                                    <FileSearch size={16} />
                                  </button>
                                  <button 
                                    className="p-1.5 rounded-full hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors text-doc-deep-blue"
                                    title="Download"
                                    onClick={() => downloadFile(doc.id, doc.metadata.name, doc.metadata.iv, doc.metadata.sender, doc.metadata.recipient)}
                                  >
                                    <ArrowDownToLine size={16} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 p-3">
                      {paginatedReceived.map((doc) => {
                        const fileName = doc.metadata.name;
                        const fileExtension = fileName.split('.').pop() || '';
                        const baseName = fileName.substring(0, fileName.lastIndexOf('.')) || fileName;
                        const truncatedName = baseName.length > 20 
                          ? baseName.substring(0, 20) + '.' + fileExtension
                          : fileName;
                        
                        return (
                          <div 
                            key={doc.id}
                            className="group bg-white/90 dark:bg-gray-800/90 rounded-lg border border-gray-200/50 dark:border-gray-600/50 hover:shadow-md transition-all duration-200 overflow-hidden aspect-[3/4]"
                          >
                            <div className="p-2">
                              <div className="w-full h-16 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-700 dark:to-gray-800 rounded-md flex items-center justify-center group-hover:scale-105 transition-transform duration-200">
                                <DocumentIcon type={doc.metadata.type.split('/')[1] || 'file'} />
                              </div>
                            </div>
                            <div className="px-2 pb-2 relative">
                              <h3 className="font-medium text-gray-900 dark:text-white text-xs mb-1 truncate" title={doc.metadata.name}>
                                {truncatedName}
                              </h3>
                              <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">
                                {formatDate(doc.metadata.timestamp)}
                              </p>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs text-gray-400 dark:text-gray-500">{formatFileSize(doc.metadata.size)}</span>
                                <div className="relative">
                                  <button 
                                    className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-400"
                                    onClick={() => setOpenDropdown(openDropdown === doc.id ? null : doc.id)}
                                  >
                                    <MoreVertical size={12} />
                                  </button>
                                  {openDropdown === doc.id && (
                                    <div className="absolute right-0 bottom-full mb-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg z-10 min-w-[120px]">
                                      <button 
                                        className="w-full px-3 py-2 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-300 flex items-center gap-2"
                                        onClick={() => {
                                          downloadFile(doc.id, doc.metadata.name, doc.metadata.iv, doc.metadata.sender, doc.metadata.recipient);
                                          setOpenDropdown(null);
                                        }}
                                      >
                                        <FileSearch size={12} />
                                        View
                                      </button>
                                      <button 
                                        className="w-full px-3 py-2 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-300 flex items-center gap-2"
                                        onClick={() => {
                                          downloadFile(doc.id, doc.metadata.name, doc.metadata.iv, doc.metadata.sender, doc.metadata.recipient);
                                          setOpenDropdown(null);
                                        }}
                                      >
                                        <ArrowDownToLine size={12} />
                                        Download
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <Pagination page={receivedPage} setPage={setReceivedPage} total={sortedReceived.length} />
                </div>
              ) : (
                <div className="py-12 text-center bg-white dark:bg-gray-900">
                  <Folder className="mx-auto h-12 w-12 text-doc-medium-gray opacity-50" />
                  <h3 className="mt-4 text-lg font-medium">No documents found</h3>
                  <p className="mt-1 text-doc-medium-gray">
                    {searchQuery ? "Try adjusting your search" : "You haven't received any files yet"}
                  </p>
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="sent" className="mt-0 dark:bg-gray-900">
              {loading ? (
                <div className="py-12 text-center">
                  <div className="animate-spin mx-auto h-12 w-12 border-4 border-doc-deep-blue border-t-transparent rounded-full"></div>
                  <h3 className="mt-4 text-lg font-medium">Loading files...</h3>
                </div>
              ) : error ? (
                <div className="py-12 text-center">
                  <AlertCircle className="mx-auto h-12 w-12 text-red-500 opacity-80" />
                  <h3 className="mt-4 text-lg font-medium">Error loading files</h3>
                  <p className="mt-1 text-doc-medium-gray">{error}</p>
                </div>
              ) : filteredSent.length > 0 ? (
                <div className="bg-white dark:bg-[#191919]">
                  {viewMode === 'list' ? (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-gray-200 dark:border-[#232323] bg-gray-100 dark:bg-[#191919]">
                            <th className="text-left py-3 px-4 font-medium text-doc-medium-gray">Name</th>
                            <th className="text-left py-3 px-4 font-medium text-doc-medium-gray">Recipient</th>
                            <th className="text-left py-3 px-4 font-medium text-doc-medium-gray">Date</th>
                            <th className="text-left py-3 px-4 font-medium text-doc-medium-gray">Size</th>
                            <th className="text-left py-3 px-4 font-medium text-doc-medium-gray">Description</th>
                            <th className="text-left py-3 px-4 font-medium text-doc-medium-gray">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedSent.map((doc) => (
                            <tr 
                              key={doc.id}
                              className="file-row bg-white dark:bg-[#191919] hover:bg-gray-100 dark:hover:bg-[#232323] border-b border-gray-200 dark:border-[#232323] transition-colors duration-150"
                            >
                              <td className="py-3 px-4">
                                <div className="flex items-center">
                                  <DocumentIcon type={doc.metadata.type.split('/')[1] || 'file'} />
                                  <span className="ml-3 font-medium">{doc.metadata.name}</span>
                                </div>
                              </td>
                              <td className="py-3 px-4 text-doc-medium-gray">
                                {doc.metadata.recipient.slice(0, 6)}...{doc.metadata.recipient.slice(-4)}
                              </td>
                              <td className="py-3 px-4 text-doc-medium-gray">
                                {formatDate(doc.metadata.timestamp)}
                              </td>
                              <td className="py-3 px-4 text-doc-medium-gray">
                                {formatFileSize(doc.metadata.size)}
                              </td>
                              <td className="py-3 px-4 text-doc-medium-gray max-w-xs truncate" title={doc.metadata.description || ''}>
                                {doc.metadata.description || <span className="text-gray-300 italic">-</span>}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                                <div className="flex gap-2">
                                  <button 
                                    className="p-1.5 rounded-full hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors text-doc-deep-blue"
                                    title="Download"
                                    onClick={() => downloadFile(doc.id, doc.metadata.name, doc.metadata.iv, doc.metadata.sender, doc.metadata.recipient)}
                                  >
                                    <ArrowDownToLine size={16} />
                                  </button>
                                  <a 
                                    href={`https://viewblock.io/arweave/tx/${doc.id}`} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="p-1.5 rounded-full hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors text-doc-deep-blue"
                                  >
                                    View Tx
                                  </a>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 p-3">
                       {paginatedSent.map((doc) => {
                         const fileName = doc.metadata.name;
                         const fileExtension = fileName.split('.').pop() || '';
                         const baseName = fileName.substring(0, fileName.lastIndexOf('.')) || fileName;
                         const truncatedName = baseName.length > 20 
                           ? baseName.substring(0, 20) + '.' + fileExtension
                           : fileName;
                         
                         return (
                           <div 
                             key={doc.id}
                             className="group bg-white/90 dark:bg-gray-800/90 rounded-lg border border-gray-200/50 dark:border-gray-600/50 hover:shadow-md transition-all duration-200 overflow-hidden aspect-[3/4]"
                           >
                             <div className="p-2">
                               <div className="w-full h-16 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-700 dark:to-gray-800 rounded-md flex items-center justify-center group-hover:scale-105 transition-transform duration-200">
                                 <DocumentIcon type={doc.metadata.type.split('/')[1] || 'file'} />
                               </div>
                             </div>
                             <div className="px-2 pb-2 relative">
                               <h3 className="font-medium text-gray-900 dark:text-white text-xs mb-1 truncate" title={doc.metadata.name}>
                                 {truncatedName}
                               </h3>
                               <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">
                                 {formatDate(doc.metadata.timestamp)}
                               </p>
                               <div className="flex items-center justify-between mb-1">
                                 <span className="text-xs text-gray-400 dark:text-gray-500">{formatFileSize(doc.metadata.size)}</span>
                                 <div className="relative">
                                   <button 
                                     className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-400"
                                     onClick={() => setOpenDropdown(openDropdown === doc.id ? null : doc.id)}
                                   >
                                     <MoreVertical size={12} />
                                   </button>
                                   {openDropdown === doc.id && (
                                     <div className="absolute right-0 bottom-full mb-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg z-10 min-w-[120px]">
                                       <button 
                                         className="w-full px-3 py-2 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-300 flex items-center gap-2"
                                         onClick={() => {
                                           downloadFile(doc.id, doc.metadata.name, doc.metadata.iv, doc.metadata.sender, doc.metadata.recipient);
                                           setOpenDropdown(null);
                                         }}
                                       >
                                         <ArrowDownToLine size={12} />
                                         Download
                                       </button>
                                       <a 
                                         href={`https://viewblock.io/arweave/tx/${doc.id}`} 
                                         target="_blank" 
                                         rel="noopener noreferrer"
                                         className="w-full px-3 py-2 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-300 flex items-center gap-2"
                                         onClick={() => setOpenDropdown(null)}
                                       >
                                         <ExternalLink size={12} />
                                         View Tx
                                       </a>
                                     </div>
                                   )}
                                 </div>
                               </div>
                             </div>
                           </div>
                         );
                       })}
                    </div>
                  )}
                  <Pagination page={sentPage} setPage={setSentPage} total={sortedSent.length} />
                </div>
              ) : (
                <div className="py-12 text-center">
                  <Folder className="mx-auto h-12 w-12 text-doc-medium-gray opacity-50" />
                  <h3 className="mt-4 text-lg font-medium">No documents found</h3>
                  <p className="mt-1 text-doc-medium-gray">
                    {searchQuery ? "Try adjusting your search" : "You haven't sent any documents yet"}
                  </p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
};

const DocumentIcon = ({ type }: { type: string }) => {
  const getColorByType = () => {
    switch (type) {
      case 'pdf': return 'text-red-500';
      case 'docx': return 'text-blue-600';
      case 'xlsx': return 'text-green-600';
      case 'pptx': return 'text-orange-500';
      case 'zip': return 'text-purple-500';
      default: return 'text-gray-500';
    }
  };

  return <File size={20} className={getColorByType()} />;
};

export default Documents;
