import Arweave from 'arweave';
import { toast } from 'sonner';
import { deriveSymmetricKeyHKDF } from './encryption';
import type { JWKInterface } from 'arweave/web/lib/wallet';

// Initialize Arweave
const arweave = Arweave.init({
  host: 'arweave.net',
  port: 443,
  protocol: 'https',
  timeout: 20000,
});

// Load JWK from environment variable (Vercel/serverless compatible)
const ARWEAVE_OWNER_JWK = import.meta.env.VITE_ARWEAVE_JWK_JSON ? JSON.parse(import.meta.env.VITE_ARWEAVE_JWK_JSON) : null;

export interface FileMetadata {
  name: string;
  type: string;
  size: number;
  sender: string;
  recipient: string;
  timestamp: number;
  description?: string;
  iv?: string; // Add IV for decryption
  sha256?: string; // Add SHA-256 hash for integrity verification
  chargeId?: string; // Add chargeId for payment gating
  documentId?: string; // Add documentId for HKDF salt
}

export interface StoredFile {
  id: string;
  metadata: FileMetadata;
}

class ArweaveService {
  private ownerWallet: JWKInterface | null = null; // Only the app owner's JWK

  constructor() {
    this.loadOwnerWallet();
  }

  /**
   * Load the app owner's Arweave wallet from environment variable (Vercel/serverless compatible)
   */
  async loadOwnerWallet(): Promise<void> {
    try {
      if (!ARWEAVE_OWNER_JWK) {
        throw new Error('Missing ARWEAVE_JWK_JSON environment variable.');
      }
      this.ownerWallet = ARWEAVE_OWNER_JWK;
      console.log('Loaded Arweave owner wallet from env variable');
    } catch (error) {
      console.error('Error loading Arweave owner wallet:', error);
      toast.error('Failed to load Arweave wallet. Please ensure ARWEAVE_JWK_JSON is set in your environment.');
      this.ownerWallet = null;
    }
  }

  /**
   * Upload a file to Arweave using the app owner's wallet (CHUNKED, with progress)
   * @param file The encrypted file data (Uint8Array)
   * @param metadata File metadata
   * @param onProgress Optional callback for upload progress (0-100)
   * @returns The transaction ID
   */
  async uploadFileToArweave(file: Uint8Array, metadata: FileMetadata, onProgress?: (pct: number) => void): Promise<string> {
    if (!this.ownerWallet) {
      await this.loadOwnerWallet();
      if (!this.ownerWallet) throw new Error('Arweave wallet not loaded');
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
      transaction.addTag('Recipient', metadata.recipient.toLowerCase());
      transaction.addTag('Timestamp', metadata.timestamp.toString());
      if (metadata.description) transaction.addTag('Description', metadata.description);
      if (metadata.iv) transaction.addTag('IV', metadata.iv);
      if (metadata.sha256) transaction.addTag('sha256', metadata.sha256); // Always add sha256 tag for integrity
      if (metadata.documentId) transaction.addTag('Document-Id', metadata.documentId); // Add documentId tag

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
        toast.warning(
          `Upload submitted but not yet confirmed. You can check status here: https://arweave.net/${transaction.id}`
        );
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
   * Wait for Arweave transaction confirmation (polls until confirmed or timeout)
   */
  async waitForConfirmation(txId: string, timeoutMs = 60000, pollInterval = 5000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const status = await arweave.transactions.getStatus(txId);
        if (status.status === 200 && status.confirmed) return;
      } catch (e) {}
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
      let tags: Record<string, string> = {};
      if (typeof tx.get === 'function') {
        // Arweave-js v2+ (transaction.get('tags'))
        const tagArr = tx.get('tags');
        if (Array.isArray(tagArr)) {
          tagArr.forEach((tag: any) => {
            const key = tag.get('name', { decode: true, string: true });
            const value = tag.get('value', { decode: true, string: true });
            tags[key] = value;
          });
        }
      } else if (Array.isArray((tx as any).tags)) {
        // Arweave-js v1 (transaction.tags)
        (tx as any).tags.forEach((tag: any) => {
          const key = tag.name ? arweave.utils.bufferToString(tag.name) : '';
          const value = tag.value ? arweave.utils.bufferToString(tag.value) : '';
          tags[key] = value;
        });
      }
      
      const metadata: FileMetadata = {
        name: tags['Document-Name'] || '',
        type: tags['Document-Type'] || '',
        size: Number(tags['Document-Size']) || 0,
        sender: tags['Sender'] || '',
        recipient: tags['Recipient'] || '',
        timestamp: Number(tags['Timestamp']) || 0,
        description: tags['Description'],
        iv: tags['IV'],
        sha256: tags['sha256'] || tags['SHA256'] || undefined,
        documentId: tags['Document-Id'] || undefined,
      };

      return { data, metadata };
    } catch (error) {
      console.error('Error fetching file from Arweave:', error);
      toast.error('Failed to retrieve file. Please try again later.');
      throw error;
    }
  }

  /**
   * Get all received files for a user address
   * Uses Arweave GraphQL to find transactions where Recipient == address
   */
  async getReceivedFiles(address: string): Promise<StoredFile[]> {
    if (!address) return [];
    try {
      const query = {
        query: `{
          transactions(
            tags: [
              { name: "App-Name", values: ["TUMA-Document-Exchange"] },
              { name: "Recipient", values: ["${address.toLowerCase()}"] }
            ]
            first: 100
          ) {
            edges {
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
      const edges = json.data.transactions.edges;
      return edges.map((edge: any) => {
        const tags: Record<string, string> = {};
        edge.node.tags.forEach((tag: any) => { tags[tag.name] = tag.value; });
        const metadata: FileMetadata = {
          name: tags['Document-Name'] || '',
          type: tags['Document-Type'] || '',
          size: Number(tags['Document-Size']) || 0,
          sender: tags['Sender'] || '',
          recipient: tags['Recipient'] || '',
          timestamp: Number(tags['Timestamp']) || 0,
          description: tags['Description'],
          iv: tags['IV'],
          sha256: tags['sha256'] || tags['SHA256'] || undefined,
        };
        return { id: edge.node.id, metadata };
      });
    } catch (error) {
      console.error('Error fetching received files from Arweave:', error);
      toast.error('Failed to fetch received files');
      return [];
    }
  }

  /**
   * Get all sent files for a user address
   * Uses Arweave GraphQL to find transactions where Sender == address
   */
  async getSentFiles(address: string): Promise<StoredFile[]> {
    if (!address) return [];
    try {
      const query = {
        query: `{
          transactions(
            tags: [
              { name: "App-Name", values: ["TUMA-Document-Exchange"] },
              { name: "Sender", values: ["${address.toLowerCase()}"] }
            ]
            first: 100
          ) {
            edges {
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
      const edges = json.data.transactions.edges;
      return edges.map((edge: any) => {
        const tags: Record<string, string> = {};
        edge.node.tags.forEach((tag: any) => { tags[tag.name] = tag.value; });
        const metadata: FileMetadata = {
          name: tags['Document-Name'] || '',
          type: tags['Document-Type'] || '',
          size: Number(tags['Document-Size']) || 0,
          sender: tags['Sender'] || '',
          recipient: tags['Recipient'] || '',
          timestamp: Number(tags['Timestamp']) || 0,
          description: tags['Description'],
          iv: tags['IV'],
          sha256: tags['sha256'] || tags['SHA256'] || undefined,
        };
        return { id: edge.node.id, metadata };
      });
    } catch (error) {
      console.error('Error fetching sent files from Arweave:', error);
      toast.error('Failed to fetch sent files');
      return [];
    }
  }
}

export const arweaveService = new ArweaveService();
