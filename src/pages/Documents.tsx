import { useState, useEffect } from "react";
import { ArrowDownToLine, ArrowUpToLine, File, FilePenLine, FileSearch, Folder, Search, AlertCircle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import Header from "@/components/Header";
import { arweaveService, StoredFile } from "@/lib/arweave-service";
import { useAccount } from 'wagmi';
import { decryptFileBufferHKDF } from '@/lib/encryption';
import { format as formatDateFns } from 'date-fns';
import { fetchPaymentStatus, PaymentStatus } from "@/lib/payment-status";

interface FileWithPayment extends StoredFile {
  isPaid?: boolean;
}

const Documents = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [receivedDocs, setReceivedDocs] = useState<FileWithPayment[]>([]);
  const [sentDocs, setSentDocs] = useState<FileWithPayment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [paymentStatuses, setPaymentStatuses] = useState<Record<string, PaymentStatus>>({});
  const [statusLoading, setStatusLoading] = useState(false);

  // Get user's Ethereum address
  const { address: userAddress } = useAccount();

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
        // Fetch received documents
        const received = await arweaveService.getReceivedFiles(userAddress?.toLowerCase() || "");
        // Fetch sent documents
        const sent = await arweaveService.getSentFiles(userAddress?.toLowerCase() || "");
        setReceivedDocs(received);
        setSentDocs(sent);
        // After fetching, fetch payment statuses for all docs with chargeId
        const allDocs = [...received, ...sent];
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
      const isRecipient = typeof recipient === 'string' && typeof userAddress === 'string' && userAddress.toLowerCase() === recipient.toLowerCase();
      if (!isSender && !isRecipient) throw new Error('You do not have permission to decrypt this file');
      if (!iv) throw new Error('Missing IV for decryption');
      const decryptAddrA = sender.toLowerCase();
      const decryptAddrB = recipient.toLowerCase();
      // --- Robust ciphertext extraction for decryption ---
      let ciphertextBase64;
      if (data instanceof Uint8Array) {
        ciphertextBase64 = uint8ArrayToBase64(data);
      } else if (typeof data === 'string') {
        ciphertextBase64 = btoa(data);
      } else {
        throw new Error('Unsupported data type for decryption');
      }
      // --- SHA-256 integrity check (if present) ---
      if (metadata && metadata.sha256) {
        const hashBuffer = await crypto.subtle.digest('SHA-256', Uint8Array.from(atob(ciphertextBase64), c => c.charCodeAt(0)));
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const sha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        if (sha256 !== metadata.sha256) {
          toast.error('Integrity check failed: File hash does not match. Download aborted.');
          return;
        }
      }
      let decrypted;
      try {
        // Use HKDF-based decryption with documentId as salt if available, fallback to docId (legacy)
        const salt = metadata.documentId || docId;
        decrypted = await decryptFileBufferHKDF(ciphertextBase64, iv, decryptAddrA, decryptAddrB, salt);
      } catch (decryptionError) {
        toast.error('Decryption failed: ' + (decryptionError instanceof Error ? decryptionError.message : 'Unknown error'));
        return;
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
      <div className="flex justify-end items-center gap-2 mt-4 bg-gray-100 dark:bg-[#191919] rounded-lg p-2">
        <button disabled={page === 1} onClick={()=>setPage(page-1)} className="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700 disabled:opacity-50">Prev</button>
        <span className="text-sm">Page {page} of {lastPage}</span>
        <button disabled={page === lastPage} onClick={()=>setPage(page+1)} className="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700 disabled:opacity-50">Next</button>
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
          </div>
          
          <Tabs defaultValue="received" className="w-full">
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
            
            <TabsContent value="received" className="mt-0">
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
                <div className="overflow-x-auto bg-white dark:bg-[#191919]">
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
                  <Pagination page={receivedPage} setPage={setReceivedPage} total={sortedReceived.length} />
                </div>
              ) : (
                <div className="py-12 text-center">
                  <Folder className="mx-auto h-12 w-12 text-doc-medium-gray opacity-50" />
                  <h3 className="mt-4 text-lg font-medium">No documents found</h3>
                  <p className="mt-1 text-doc-medium-gray">
                    {searchQuery ? "Try adjusting your search" : "You haven't received any files yet"}
                  </p>
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="sent" className="mt-0">
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
                <div className="overflow-x-auto bg-white dark:bg-[#191919]">
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
