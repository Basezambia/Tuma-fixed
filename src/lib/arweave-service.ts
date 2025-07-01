import Arweave from 'arweave';
import { toast } from 'sonner';
import { deriveSymmetricKeyHKDF } from './encryption';
import type { JWKInterface } from 'arweave/web/lib/wallet';
import { getName, getAddress } from '@coinbase/onchainkit/identity';
import { base } from 'viem/chains';

// Initialize Arweave
const arweave = Arweave.init({
  host: 'arweave.net',
  port: 443,
  protocol: 'https',
  timeout: 20000,
});

// Load JWK from environment variable (Vercel/serverless compatible)
// Try multiple environment variable formats to ensure compatibility
const getArweaveJwk = () => {
  // For client-side (Vite)
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    if (import.meta.env.VITE_ARWEAVE_JWK_JSON) {
      try {
        return JSON.parse(import.meta.env.VITE_ARWEAVE_JWK_JSON);
      } catch (e) {
        console.error('Failed to parse VITE_ARWEAVE_JWK_JSON:', e);
      }
    }
  }
  
  // For server-side (Node.js/Vercel)
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.ARWEAVE_JWK_JSON) {
      try {
        return JSON.parse(process.env.ARWEAVE_JWK_JSON);
      } catch (e) {
        console.error('Failed to parse ARWEAVE_JWK_JSON:', e);
      }
    }
    if (process.env.VITE_ARWEAVE_JWK_JSON) {
      try {
        return JSON.parse(process.env.VITE_ARWEAVE_JWK_JSON);
      } catch (e) {
        console.error('Failed to parse VITE_ARWEAVE_JWK_JSON:', e);
      }
    }
  }
  
  return null;
};

const ARWEAVE_OWNER_JWK = getArweaveJwk();

export interface FileMetadata {
  name: string;
  type: string;
  size: number;
  sender: string;
  recipient: string; // Keep for backward compatibility
  recipients?: string[]; // Add array for multiple recipients
  recipientAddress?: string; // Add recipientAddress for Send.tsx compatibility
  timestamp: number;
  description?: string;
  iv?: string; // Add IV for decryption
  sha256?: string; // Add SHA-256 hash for integrity verification
  chargeId?: string; // Add chargeId for payment gating
  documentId?: string; // Add documentId for HKDF salt
  parentFolderId?: string; // Add parentFolderId for folder structure
  fileCount?: number; // Add fileCount for folders
  encryptionKey?: string; // Add encryptionKey for Send.tsx compatibility
}

export interface StoredFile {
  id: string;
  metadata: FileMetadata;
}

class ArweaveService {
  private ownerWallet: JWKInterface | null = null; // Only the app owner's JWK
  private nameCache: Map<string, string | null> = new Map(); // Cache for address -> name resolution
  private cacheExpiry: Map<string, number> = new Map(); // Cache expiry timestamps
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  
  // File caching for getSentFiles and getReceivedFiles
  private sentFilesCache: Map<string, StoredFile[]> = new Map();
  private receivedFilesCache: Map<string, StoredFile[]> = new Map();
  private filesCacheExpiry: Map<string, number> = new Map();
  private readonly FILES_CACHE_DURATION = 2 * 60 * 1000; // 2 minutes for files
  private readonly MAX_CACHE_SIZE = 50; // Maximum number of cached entries
  
  // In-flight request tracking to prevent duplicate API calls
  private pendingSentFilesRequests: Map<string, Promise<StoredFile[]>> = new Map();
  private pendingReceivedFilesRequests: Map<string, Promise<StoredFile[]>> = new Map();

  constructor() {
    this.loadOwnerWallet();
  }

  /**
   * Load the app owner's Arweave wallet from environment variable (Vercel/serverless compatible)
   */
  async loadOwnerWallet(): Promise<void> {
    try {
      // If we already have a wallet, don't try to load it again
      if (this.ownerWallet) {
        return;
      }
      
      // Try to get the wallet from the environment variable
      if (!ARWEAVE_OWNER_JWK) {
        // For direct uploads, we'll use the API endpoint instead
        console.log('No Arweave JWK found in environment variables. Will use API for uploads.');
        return;
      }
      
      this.ownerWallet = ARWEAVE_OWNER_JWK;
      console.log('Loaded Arweave owner wallet from env variable');
    } catch (error) {
      console.error('Error loading Arweave owner wallet:', error);
      // Don't show toast errors on initial load as it's confusing to users
      // toast.error('Failed to load Arweave wallet. Please ensure ARWEAVE_JWK_JSON is set in your environment.');
      this.ownerWallet = null;
    }
  }

  /**
   * Upload a file to Arweave using the app owner's wallet (CHUNKED, with progress)
   * or via the API endpoint if wallet is not available
   * @param file The encrypted file data (Uint8Array)
   * @param metadata File metadata
   * @param onProgress Optional callback for upload progress (0-100)
   * @param customTags Optional custom tags to add to the transaction
   * @returns The transaction ID
   */
  async uploadFileToArweave(file: Uint8Array, metadata: FileMetadata, onProgress?: (pct: number) => void, customTags?: { name: string; value: string }[]): Promise<string> {
    // Try to load the wallet if we don't have it
    if (!this.ownerWallet) {
      await this.loadOwnerWallet();
    }
    
    // If we have a wallet, use direct upload method
    if (this.ownerWallet) {
      return this.directUploadToArweave(file, metadata, onProgress, customTags);
    } else {
      // Otherwise use the API endpoint
      return this.apiUploadToArweave(file, metadata, onProgress, customTags);
    }
  }
  
  /**
   * Upload file and invalidate cache for sender to ensure fresh data
   */
  async uploadFileWithCacheInvalidation(file: Uint8Array, metadata: FileMetadata, onProgress?: (pct: number) => void, customTags?: { name: string; value: string }[]): Promise<string> {
    const txId = await this.uploadFileToArweave(file, metadata, onProgress, customTags);
    
    // Invalidate cache for sender to ensure fresh data on next fetch
    this.invalidateCache(metadata.sender);
    
    // Also invalidate cache for all recipients
    if (metadata.recipients && Array.isArray(metadata.recipients)) {
      metadata.recipients.forEach(recipient => this.invalidateCache(recipient));
    } else if (metadata.recipient) {
      this.invalidateCache(metadata.recipient);
    }
    
    return txId;
  }
  
  /**
   * Upload a file to Arweave directly using the app owner's wallet
   * @private
   */
  private async directUploadToArweave(file: Uint8Array, metadata: FileMetadata, onProgress?: (pct: number) => void, customTags?: { name: string; value: string }[]): Promise<string> {
    if (!this.ownerWallet) {
      throw new Error('Arweave wallet not loaded');
    }
    
    let transaction;
    try {
      transaction = await arweave.createTransaction({ data: file }, this.ownerWallet!);
      transaction.addTag('Content-Type', metadata.type);
      transaction.addTag('App-Name', 'TUMA-Document-Exchange');
      transaction.addTag('Document-Name', metadata.name);
      transaction.addTag('Document-Type', metadata.type);
      transaction.addTag('Document-Size', metadata.size.toString());
      transaction.addTag('Sender', metadata.sender.toLowerCase());
      transaction.addTag('Timestamp', metadata.timestamp.toString());
      
      // Handle multiple recipients
      if (metadata.recipients && Array.isArray(metadata.recipients)) {
        metadata.recipients.forEach((recipient, index) => {
          transaction.addTag(`Recipient-${index}`, recipient.toLowerCase());
        });
      } else {
        // Fallback to single recipient for backward compatibility
        transaction.addTag('Recipient-0', metadata.recipient.toLowerCase());
      }
      
      if (metadata.description) transaction.addTag('Description', metadata.description);
      if (metadata.iv) transaction.addTag('IV', metadata.iv);
      if (metadata.sha256) transaction.addTag('sha256', metadata.sha256);
      if (metadata.documentId) transaction.addTag('Document-Id', metadata.documentId);
      
      // Add custom tags if provided
      if (customTags && Array.isArray(customTags)) {
        customTags.forEach(tag => {
          transaction.addTag(tag.name, tag.value);
        });
      }
  
      await arweave.transactions.sign(transaction, this.ownerWallet!);
  
      // Use chunked uploader for reliability and progress
      const uploader = await arweave.transactions.getUploader(transaction);
      let lastPct = 0;
      let chunkIndex = 0;
      while (!uploader.isComplete) {
        await uploader.uploadChunk();
        chunkIndex++;
        // Log detailed uploader status for debugging
        console.log('[Arweave Upload]', {
          pctComplete: uploader.pctComplete,
          lastResponseStatus: uploader.lastResponseStatus,
          totalChunks: uploader.totalChunks,
          uploadedChunks: chunkIndex,
          isComplete: uploader.isComplete
        });
        if (onProgress) onProgress(uploader.pctComplete);
        lastPct = uploader.pctComplete;
      }
      // Ensure uploader really finished
      if (!uploader.isComplete) {
        throw new Error('Uploader did not complete all chunks!');
      }
      // Wait for confirmation (now 5 minutes)
      try {
        await this.waitForConfirmation(transaction.id, 300000, 5000);
      } catch (err) {
        // Show a warning but do not treat as hard error
        console.warn('Arweave transaction not confirmed in time, but upload likely succeeded:', transaction.id);
        toast.warning(`The transaction is still pending, when complete user will be notified`);
        // Still return txId so user can check status
      }

      return transaction.id;
    } catch (error) {
      console.error('Error uploading document:', error);
      if (transaction && transaction.id) {
        toast.error(
          `Failed to confirm upload, but transaction was submitted. Check status: https://arweave.net/${transaction.id}`
        );
        return transaction.id;
      } else {
        toast.error('Failed to upload document to Arweave');
        throw error;
      }
    }
  }
  
  /**
   * Upload a file to Arweave via the API endpoint
   * @private
   */
  private async apiUploadToArweave(file: Uint8Array, metadata: FileMetadata, onProgress?: (pct: number) => void, customTags?: { name: string; value: string }[]): Promise<string> {
    try {
      if (onProgress) onProgress(10);
      
      // Convert Uint8Array to base64 using browser-compatible method
      const base64Data = btoa(String.fromCharCode(...file));
      
      if (onProgress) onProgress(30);
      
      const payload = {
        ciphertext: base64Data,
        metadata: {
          'Content-Type': metadata.type,
          'Document-Name': metadata.name,
          'Document-Type': metadata.type,
          'Document-Size': metadata.size.toString(),
          'Sender': metadata.sender.toLowerCase(),
          'Timestamp': metadata.timestamp.toString(),
        }
      };
      
      // Handle multiple recipients
      if (metadata.recipients && Array.isArray(metadata.recipients)) {
        metadata.recipients.forEach((recipient, index) => {
          payload.metadata[`Recipient-${index}`] = recipient.toLowerCase();
        });
      } else {
        payload.metadata['Recipient-0'] = metadata.recipient.toLowerCase();
      }
      
      // Add optional metadata
      if (metadata.description) payload.metadata['Description'] = metadata.description;
      if (metadata.iv) payload.metadata['IV'] = metadata.iv;
      if (metadata.sha256) payload.metadata['sha256'] = metadata.sha256;
      if (metadata.documentId) payload.metadata['Document-Id'] = metadata.documentId;
      
      // Add custom tags if provided
      if (customTags && Array.isArray(customTags)) {
        customTags.forEach(tag => {
          payload.metadata[tag.name] = tag.value;
        });
      }
      
      // Make API request to our serverless function
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      
      if (onProgress) onProgress(90); // Update progress after API call
      
      // Handle API response
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'API upload failed');
      }
      
      const data = await response.json();
      
      if (onProgress) onProgress(100); // Complete progress
      
      return data.id;
    } catch (error) {
      console.error('Error uploading document via API:', error);
      toast.error('Failed to upload document: ' + (error instanceof Error ? error.message : 'Unknown error'));
      throw error;
    }
  }

  /**
   * Wait for Arweave transaction confirmation (polls until confirmed or timeout)
   */
  async waitForConfirmation(txId: string, timeoutMs = 60000, pollInterval = 5000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const status = await arweave.transactions.getStatus(txId);
        if (status.status === 200 && status.confirmed) return;
      } catch (e) {
        // Ignore errors and continue polling
      }
      await new Promise(res => setTimeout(res, pollInterval));
    }
    throw new Error('Arweave transaction not confirmed in time');
  }

  /**
   * Fetch a file and metadata from Arweave by transaction ID
   * With improved error handling and fallback mechanisms
   */
  async getFile(id: string): Promise<{ data: Uint8Array; metadata: FileMetadata }> {
    try {
      // Try multiple gateways if the primary one fails
      const gateways = [
        'arweave.net',
        'g8way.io',
        'arweave.dev'
      ];
      
      let lastError: Error | null = null;
      let tx;
      let dataRaw;
      
      // Try each gateway until one works
      for (const gateway of gateways) {
        try {
          // Configure arweave for this gateway
          const gatewayArweave = Arweave.init({
            host: gateway,
            port: 443,
            protocol: 'https',
            timeout: 30000, // Increased timeout
          });
          
          // Try to get the transaction
          tx = await gatewayArweave.transactions.get(id);
          
          // If we got the transaction, try to get the data
          try {
            dataRaw = await gatewayArweave.transactions.getData(id, { decode: true });
            if (dataRaw) {
              // We successfully got both tx and data, break out of the gateway loop
              break;
            }
          } catch (dataError) {
            console.warn(`Failed to get data from ${gateway} for ${id}:`, dataError);
            lastError = dataError instanceof Error ? dataError : new Error(String(dataError));
          }
        } catch (txError) {
          console.warn(`Failed to get transaction from ${gateway} for ${id}:`, txError);
          lastError = txError instanceof Error ? txError : new Error(String(txError));
        }
      }
      
      // If we couldn't get the transaction or data from any gateway
      if (!tx || !dataRaw) {
        throw lastError || new Error('Failed to retrieve file from all gateways');
      }
      
      // Process the data
      let data: Uint8Array;
      if (typeof dataRaw === 'string') {
        // Convert string to Uint8Array
        data = new TextEncoder().encode(dataRaw);
      } else if (dataRaw instanceof Uint8Array) {
        data = dataRaw;
      } else if (typeof ArrayBuffer !== 'undefined' && dataRaw instanceof ArrayBuffer) {
        data = new Uint8Array(dataRaw);
      } else {
        throw new Error('Unsupported data type received from Arweave');
      }
      
      // Parse tags for metadata
      const tags: Record<string, string> = {};
      if (typeof tx.get === 'function') {
        // Arweave-js v2+ (transaction.get('tags'))
        const tagArr = tx.get('tags');
        if (Array.isArray(tagArr)) {
          tagArr.forEach((tag: { get: (name: string, options: { decode: boolean, string: boolean }) => string }) => {
            const key = tag.get('name', { decode: true, string: true });
            const value = tag.get('value', { decode: true, string: true });
            tags[key] = value;
          });
        }
      } else if (Array.isArray((tx as any).tags)) {
        // Arweave-js v1 (transaction.tags)
        (tx as { tags: Array<{ name: Uint8Array; value: Uint8Array }> }).tags.forEach((tag: { name: Uint8Array; value: Uint8Array }) => {
          const key = tag.name ? arweave.utils.bufferToString(tag.name) : '';
          const value = tag.value ? arweave.utils.bufferToString(tag.value) : '';
          tags[key] = value;
        });
      }
      
      // In the getFile method, around line 380-400, update the metadata parsing:
      const metadata: FileMetadata = {
        name: tags['Document-Name'] || '',
        type: tags['Document-Type'] || '',
        size: Number(tags['Document-Size']) || 0,
        sender: tags['Sender'] || '',
        recipient: tags['Recipient-0'] || tags['Recipient'] || '', // Fallback to old format
        recipients: [], // Initialize recipients array
        timestamp: Number(tags['Timestamp']) || 0,
        description: tags['Description'],
        iv: tags['IV'],
        sha256: tags['sha256'] || tags['SHA256'] || undefined,
        documentId: tags['Document-Id'] || undefined,
      };
      
      // Parse multiple recipients
      const recipients = [];
      for (let i = 0; i < 10; i++) {
        const recipientTag = tags[`Recipient-${i}`];
        if (recipientTag) {
          recipients.push(recipientTag);
        }
      }
      if (recipients.length > 0) {
        metadata.recipients = recipients;
      }
      return { data, metadata };
    } catch (error) {
      console.error('Error fetching file from Arweave:', error);
      toast.error('Failed to retrieve file. Please try again later.');
      throw error;
    }
  }

  /**
   * Resolve address to ENS/Base name (reverse resolution) with caching
   */
  private async resolveAddressToName(address: string): Promise<string | null> {
    const normalizedAddress = address.toLowerCase();
    
    // Check cache first
    const cached = this.nameCache.get(normalizedAddress);
    const cacheTime = this.cacheExpiry.get(normalizedAddress);
    
    if (cached !== undefined && cacheTime && Date.now() < cacheTime) {
      return cached;
    }
    
    try {
      const name = await getName({ address: address as `0x${string}`, chain: base });
      const result = name || null;
      
      // Cache the result
      this.nameCache.set(normalizedAddress, result);
      this.cacheExpiry.set(normalizedAddress, Date.now() + this.CACHE_DURATION);
      
      return result;
    } catch (error) {
      // No ENS/Base name found for address
      
      // Cache null result to avoid repeated failed lookups
      this.nameCache.set(normalizedAddress, null);
      this.cacheExpiry.set(normalizedAddress, Date.now() + this.CACHE_DURATION);
      
      return null;
    }
  }

  /**
   * Get all possible recipient identifiers for an address
   * Returns both the address and any ENS/Base names that resolve to it
   */
  private async getAllRecipientIdentifiers(address: string): Promise<string[]> {
    const identifiers = [address.toLowerCase()];
    
    try {
      // Try to get ENS/Base name for this address
      const name = await this.resolveAddressToName(address);
      if (name) {
        identifiers.push(name.toLowerCase());
        
        // Also check common variations
        if (name.endsWith('.eth')) {
          identifiers.push(name.toLowerCase());
        }
        if (name.endsWith('.base.eth')) {
          identifiers.push(name.toLowerCase());
        }
      }
    } catch (error) {
      // Error resolving address to name
    }
    
    return [...new Set(identifiers)]; // Remove duplicates
  }

  /**
   * Get all received files for a user address with caching
   * Uses Arweave GraphQL to find transactions where any Recipient-X == address or ENS/Base name
   * Implements cursor-based pagination to fetch all results (Arweave limits to 100 per query)
   */
  async getReceivedFiles(address: string): Promise<StoredFile[]> {
    if (!address) return [];
    
    const normalizedAddress = address.toLowerCase();
    
    // Check cache first
    const cached = this.receivedFilesCache.get(normalizedAddress);
    const cacheTime = this.filesCacheExpiry.get(normalizedAddress);
    
    if (cached && cacheTime && Date.now() < cacheTime) {
      return cached;
    }
    
    // Check if there's already a pending request for this address
    const pendingRequest = this.pendingReceivedFilesRequests.get(normalizedAddress);
    if (pendingRequest) {
      return pendingRequest;
    }
    
    // Create new request and cache it
    const request = this.fetchReceivedFilesFromArweave(normalizedAddress);
    this.pendingReceivedFilesRequests.set(normalizedAddress, request);
    
    try {
      const files = await request;
      
      // Cache the result
      this.receivedFilesCache.set(normalizedAddress, files);
      this.filesCacheExpiry.set(normalizedAddress, Date.now() + this.FILES_CACHE_DURATION);
      
      // Clean up expired cache entries periodically
      this.cleanupExpiredCache();
      
      return files;
    } finally {
      // Remove from pending requests
      this.pendingReceivedFilesRequests.delete(normalizedAddress);
    }
  }
  
  /**
   * Internal method to fetch received files from Arweave
   * @private
   */
  private async fetchReceivedFilesFromArweave(address: string): Promise<StoredFile[]> {
    try {
      // Get all possible identifiers for this address (address + ENS/Base names)
      const recipientIdentifiers = await this.getAllRecipientIdentifiers(address);
      
      // Build all possible recipient tag names in one query
      const recipientTags: string[] = [];
      for (let i = 0; i < 10; i++) {
        recipientTags.push(`Recipient-${i}`);
        recipientTags.push(`Recipient-Name-${i}`);
      }
      
      // Single optimized query that searches all recipient positions at once
      const allFiles: StoredFile[] = [];
      let hasNextPage = true;
      let cursor = null;
      
      while (hasNextPage) {
        // Create OR conditions for all recipient tag positions
        const recipientConditions = recipientTags.map(tagName => 
          `{ name: "${tagName}", values: [${recipientIdentifiers.map(id => `"${id}"`).join(', ')}] }`
        ).join(',\n              ');
        
        const query = {
          query: `{
            transactions(
              tags: [
                { name: "App-Name", values: ["TUMA-Document-Exchange"] }
              ]
              first: 100${cursor ? `,\n              after: "${cursor}"` : ''}
            ) {
              pageInfo {
                hasNextPage
              }
              edges {
                cursor
                node {
                  id
                  tags {
                    name
                    value
                  }
                }
              }
            }
          }`
        };
        
        const res = await fetch('https://arweave.net/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(query)
        });
        
        const json = await res.json();
        
        if (!json.data || !json.data.transactions) {
          break;
        }
        
        const { edges, pageInfo } = json.data.transactions;
        hasNextPage = pageInfo.hasNextPage;
        
        // Filter results to only include files where user is a recipient
        const pageFiles = edges
          .filter((edge: any) => {
            const tags: Record<string, string> = {};
            edge.node.tags.forEach((tag: any) => { tags[tag.name] = tag.value; });
            
            // Check if any recipient tag matches our identifiers
            for (let i = 0; i < 10; i++) {
              const recipientValue = tags[`Recipient-${i}`] || tags[`Recipient-Name-${i}`];
              if (recipientValue && recipientIdentifiers.some(id => 
                id.toLowerCase() === recipientValue.toLowerCase()
              )) {
                return true;
              }
            }
            return false;
          })
          .map((edge: any) => {
            const tags: Record<string, string> = {};
            edge.node.tags.forEach((tag: any) => { tags[tag.name] = tag.value; });
            
            // Extract all recipients from Recipient-X tags
            const recipients: string[] = [];
            for (let i = 0; i < 10; i++) {
              const recipientTag = `Recipient-${i}`;
              if (tags[recipientTag]) {
                recipients.push(tags[recipientTag]);
              }
            }
            
            const metadata: FileMetadata = {
              name: tags['Document-Name'] || '',
              type: tags['Document-Type'] || '',
              size: Number(tags['Document-Size']) || 0,
              sender: tags['Sender'] || '',
              recipient: tags['Recipient'] || tags['Recipient-0'] || '',
              recipients: recipients.length > 0 ? recipients : undefined,
              timestamp: Number(tags['Timestamp']) || 0,
              description: tags['Description'],
              iv: tags['IV'],
              sha256: tags['sha256'] || tags['SHA256'] || undefined,
              chargeId: tags['Charge-Id'] || undefined,
              documentId: tags['Document-Id'] || undefined
            };
            
            return { id: edge.node.id, metadata };
          });
        
        allFiles.push(...pageFiles);
        
        // Update cursor for next page
        if (hasNextPage && edges.length > 0) {
          cursor = edges[edges.length - 1].cursor;
        }
        
        // Safety break to prevent infinite loops
        if (allFiles.length > 50000) {
          console.warn('Reached safety limit of 50,000 files for received files query');
          break;
        }
      }
      
      return allFiles;
    } catch (error) {
      console.error('Error fetching received files from Arweave:', error);
      toast.error('Failed to fetch received files');
      return [];
    }
  }
  
  /**
   * Helper function to fetch files with cursor-based pagination
   * @private
   */
  private async fetchFilesWithPagination(tags: Array<{name: string, values: string[]}>): Promise<StoredFile[]> {
    const allFiles: StoredFile[] = [];
    let hasNextPage = true;
    let cursor = null;
    
    while (hasNextPage) {
      const tagQueries = tags.map(tag => 
        `{ name: "${tag.name}", values: [${tag.values.map(v => `"${v}"`).join(', ')}] }`
      ).join(',\n              ');
      
      const query = {
        query: `{
          transactions(
            tags: [
              ${tagQueries}
            ]
            first: 100${cursor ? `,\n            after: "${cursor}"` : ''}
          ) {
            pageInfo {
              hasNextPage
            }
            edges {
              cursor
              node {
                id
                tags {
                  name
                  value
                }
              }
            }
          }
        }`
      };
      
      const res = await fetch('https://arweave.net/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(query)
      });
      
      const json = await res.json();
      
      if (!json.data || !json.data.transactions) {
        break;
      }
      
      const { edges, pageInfo } = json.data.transactions;
      hasNextPage = pageInfo.hasNextPage;
      
      // Process current page results
      const pageFiles = edges.map((edge: any) => {
        const tags: Record<string, string> = {};
        edge.node.tags.forEach((tag: any) => { tags[tag.name] = tag.value; });
        
        // Extract all recipients from Recipient-X tags
        const recipients: string[] = [];
        for (let i = 0; i < 10; i++) {
          const recipientTag = `Recipient-${i}`;
          if (tags[recipientTag]) {
            recipients.push(tags[recipientTag]);
          }
        }
        
        const metadata: FileMetadata = {
          name: tags['Document-Name'] || '',
          type: tags['Document-Type'] || '',
          size: Number(tags['Document-Size']) || 0,
          sender: tags['Sender'] || '',
          recipient: tags['Recipient'] || tags['Recipient-0'] || '', // Fallback to Recipient-0
          recipients: recipients.length > 0 ? recipients : undefined, // Add recipients array
          timestamp: Number(tags['Timestamp']) || 0,
          description: tags['Description'],
          iv: tags['IV'],
          sha256: tags['sha256'] || tags['SHA256'] || undefined,
          chargeId: tags['Charge-Id'] || undefined,
          documentId: tags['Document-Id'] || undefined
        };
        
        return { id: edge.node.id, metadata };
      });
      
      allFiles.push(...pageFiles);
      
      // Update cursor for next page
      if (hasNextPage && edges.length > 0) {
        cursor = edges[edges.length - 1].cursor;
      }
      
      // Safety break to prevent infinite loops
      if (allFiles.length > 50000) {
        console.warn('Reached safety limit of 50,000 files for single tag query');
        break;
      }
    }
    
    return allFiles;
  }

  /**
   * Clear expired cache entries to prevent memory leaks
   * @private
   */
  private cleanupExpiredCache(): void {
    const now = Date.now();
    
    // Clean up name cache
    for (const [key, expiry] of this.cacheExpiry.entries()) {
      if (now > expiry) {
        this.nameCache.delete(key);
        this.cacheExpiry.delete(key);
      }
    }
    
    // Clean up files cache
    for (const [key, expiry] of this.filesCacheExpiry.entries()) {
      if (now > expiry) {
        this.sentFilesCache.delete(key);
        this.receivedFilesCache.delete(key);
        this.filesCacheExpiry.delete(key);
      }
    }
    
    // Limit cache size to prevent memory issues
    if (this.sentFilesCache.size > this.MAX_CACHE_SIZE) {
      const oldestKeys = Array.from(this.filesCacheExpiry.entries())
        .sort(([,a], [,b]) => a - b)
        .slice(0, this.sentFilesCache.size - this.MAX_CACHE_SIZE)
        .map(([key]) => key);
      
      oldestKeys.forEach(key => {
        this.sentFilesCache.delete(key);
        this.receivedFilesCache.delete(key);
        this.filesCacheExpiry.delete(key);
      });
    }
  }
  
  /**
   * Invalidate cache for a specific address
   * Useful when new files are uploaded
   */
  invalidateCache(address: string): void {
    const normalizedAddress = address.toLowerCase();
    this.sentFilesCache.delete(normalizedAddress);
    this.receivedFilesCache.delete(normalizedAddress);
    this.filesCacheExpiry.delete(normalizedAddress);
    this.pendingSentFilesRequests.delete(normalizedAddress);
    this.pendingReceivedFilesRequests.delete(normalizedAddress);
  }
  
  /**
   * Get all sent files for a user address with caching
   * Uses Arweave GraphQL to find transactions where Sender == address or ENS/Base name
   * Implements cursor-based pagination to fetch all results (Arweave limits to 100 per query)
   */
  async getSentFiles(address: string): Promise<StoredFile[]> {
    if (!address) return [];
    
    const normalizedAddress = address.toLowerCase();
    
    // Check cache first
    const cached = this.sentFilesCache.get(normalizedAddress);
    const cacheTime = this.filesCacheExpiry.get(normalizedAddress);
    
    if (cached && cacheTime && Date.now() < cacheTime) {
      return cached;
    }
    
    // Check if there's already a pending request for this address
    const pendingRequest = this.pendingSentFilesRequests.get(normalizedAddress);
    if (pendingRequest) {
      return pendingRequest;
    }
    
    // Create new request and cache it
    const request = this.fetchSentFilesFromArweave(normalizedAddress);
    this.pendingSentFilesRequests.set(normalizedAddress, request);
    
    try {
      const files = await request;
      
      // Cache the result
      this.sentFilesCache.set(normalizedAddress, files);
      this.filesCacheExpiry.set(normalizedAddress, Date.now() + this.FILES_CACHE_DURATION);
      
      // Clean up expired cache entries periodically
      this.cleanupExpiredCache();
      
      return files;
    } finally {
      // Remove from pending requests
      this.pendingSentFilesRequests.delete(normalizedAddress);
    }
  }
  
  /**
   * Internal method to fetch sent files from Arweave
   * @private
   */
  private async fetchSentFilesFromArweave(address: string): Promise<StoredFile[]> {
    try {
      // Get all possible identifiers for this address (address + ENS/Base names)
      const senderIdentifiers = await this.getAllRecipientIdentifiers(address);
      
      let allFiles: StoredFile[] = [];
      let hasNextPage = true;
      let cursor = null;
      
      // Fetch all pages using cursor-based pagination
      while (hasNextPage) {
        const query = {
          query: `{
            transactions(
              tags: [
                { name: "App-Name", values: ["TUMA-Document-Exchange"] },
                { name: "Sender", values: [${senderIdentifiers.map(id => `"${id}"`).join(', ')}] }
              ]
              first: 100${cursor ? `,\n              after: "${cursor}"` : ''}
            ) {
              pageInfo {
                hasNextPage
              }
              edges {
                cursor
                node {
                  id
                  tags {
                    name
                    value
                  }
                }
              }
            }
          }`
        };
        
        const res = await fetch('https://arweave.net/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(query)
        });
        const json = await res.json();
        
        if (!json.data || !json.data.transactions) {
          break;
        }
        
        const { edges, pageInfo } = json.data.transactions;
        hasNextPage = pageInfo.hasNextPage;
        
        // Process current page results
        const pageFiles = edges.map((edge: any) => {
          const tags: Record<string, string> = {};
          edge.node.tags.forEach((tag: any) => { tags[tag.name] = tag.value; });
          
          // Extract all recipients from Recipient-X tags
          const recipients: string[] = [];
          for (let i = 0; i < 10; i++) {
            const recipientTag = `Recipient-${i}`;
            if (tags[recipientTag]) {
              recipients.push(tags[recipientTag]);
            }
          }
          
          const metadata: FileMetadata = {
            name: tags['Document-Name'] || '',
            type: tags['Document-Type'] || '',
            size: Number(tags['Document-Size']) || 0,
            sender: tags['Sender'] || '',
            recipient: tags['Recipient'] || tags['Recipient-0'] || '', // Fallback to Recipient-0
            recipients: recipients.length > 0 ? recipients : undefined, // Add recipients array
            timestamp: Number(tags['Timestamp']) || 0,
            description: tags['Description'],
            iv: tags['IV'],
            sha256: tags['sha256'] || tags['SHA256'] || undefined,
            chargeId: tags['Charge-Id'] || undefined,
            documentId: tags['Document-Id'] || undefined
          };
          return { id: edge.node.id, metadata };
        });
        
        allFiles = allFiles.concat(pageFiles);
        
        // Update cursor for next page
        if (hasNextPage && edges.length > 0) {
          cursor = edges[edges.length - 1].cursor;
        }
        
        // Safety break to prevent infinite loops
        if (allFiles.length > 50000) {
          console.warn('Reached safety limit of 50,000 files');
          break;
        }
      }
      
      return allFiles;
    } catch (error) {
      console.error('Error fetching sent files from Arweave:', error);
      toast.error('Failed to fetch sent files');
      return [];
    }
  }
}

export const arweaveService = new ArweaveService();
