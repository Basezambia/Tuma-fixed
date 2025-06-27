import Arweave from 'arweave';
import { validateFileUpload, validateWalletAddress, validateENSName } from './security-utils';
import { rateLimiters, getUserIdentifier } from './rate-limiter';
import { logSecurityEvent, SecurityEventType, SecurityLevel } from './security-monitor';
import { secureConfig } from './secure-config';
import { XSSProtection } from './xss-csrf-protection';

interface SecureFileUpload {
  file: File;
  recipient: string;
  description?: string;
  tags?: Record<string, string>;
}

interface FileMetadata {
  id: string;
  filename: string;
  size: number;
  type: string;
  uploadedAt: number;
  sender: string;
  recipient: string;
  description?: string;
  checksum: string;
  encrypted: boolean;
}

interface SecurityScanResult {
  safe: boolean;
  threats: string[];
  risk: 'low' | 'medium' | 'high' | 'critical';
}

export class SecureArweaveService {
  private static instance: SecureArweaveService;
  private arweave: Arweave;
  private jwk: any;
  private addressCache: Map<string, { name: string; timestamp: number }> = new Map();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
  
  private constructor() {
    this.arweave = Arweave.init({
      host: 'arweave.net',
      port: 443,
      protocol: 'https'
    });
    
    this.initializeJWK();
  }
  
  static getInstance(): SecureArweaveService {
    if (!SecureArweaveService.instance) {
      SecureArweaveService.instance = new SecureArweaveService();
    }
    return SecureArweaveService.instance;
  }
  
  private async initializeJWK(): Promise<void> {
    try {
      const jwkString = secureConfig.getRequired('VITE_ARWEAVE_JWK');
      this.jwk = JSON.parse(jwkString);
      
      // Validate JWK structure
      if (!this.jwk.kty || !this.jwk.n || !this.jwk.e || !this.jwk.d) {
        throw new Error('Invalid JWK structure');
      }
      
      logSecurityEvent(
        SecurityEventType.AUTHENTICATION_SUCCESS,
        SecurityLevel.LOW,
        { action: 'Arweave JWK loaded successfully' }
      );
    } catch (error) {
      logSecurityEvent(
        SecurityEventType.AUTHENTICATION_FAILURE,
        SecurityLevel.CRITICAL,
        { 
          action: 'Failed to load Arweave JWK',
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      );
      throw new Error('Failed to initialize Arweave service');
    }
  }
  
  async uploadFileSecurely(uploadData: SecureFileUpload): Promise<string> {
    const userIdentifier = getUserIdentifier();
    
    try {
      // Rate limiting check
      const rateLimitResult = await rateLimiters.upload.checkLimit(userIdentifier);
      if (!rateLimitResult.allowed) {
        logSecurityEvent(
          SecurityEventType.RATE_LIMIT_EXCEEDED,
          SecurityLevel.MEDIUM,
          {
            action: 'File upload rate limit exceeded',
            userIdentifier,
            resetTime: new Date(rateLimitResult.resetTime).toISOString()
          }
        );
        throw new Error('Upload rate limit exceeded. Please try again later.');
      }
      
      // Validate file
      const fileValidation = validateFileUpload(uploadData.file);
      if (!fileValidation.valid) {
        logSecurityEvent(
          SecurityEventType.FILE_UPLOAD_BLOCKED,
          SecurityLevel.HIGH,
          {
            reason: fileValidation.error,
            filename: uploadData.file.name,
            fileSize: uploadData.file.size,
            fileType: uploadData.file.type
          }
        );
        throw new Error(fileValidation.error);
      }
      
      // Validate recipient
      if (!this.validateRecipient(uploadData.recipient)) {
        throw new Error('Invalid recipient address or ENS name');
      }
      
      // Security scan
      const scanResult = await this.scanFileForThreats(uploadData.file);
      if (!scanResult.safe) {
        logSecurityEvent(
          SecurityEventType.MALICIOUS_FILE_DETECTED,
          SecurityLevel.CRITICAL,
          {
            filename: uploadData.file.name,
            threats: scanResult.threats,
            risk: scanResult.risk
          }
        );
        throw new Error(`File blocked: ${scanResult.threats.join(', ')}`);
      }
      
      // Sanitize description
      const sanitizedDescription = uploadData.description 
        ? XSSProtection.sanitizeText(uploadData.description)
        : undefined;
      
      // Calculate file checksum
      const checksum = await this.calculateFileChecksum(uploadData.file);
      
      // Prepare file data
      const fileBuffer = await uploadData.file.arrayBuffer();
      
      // Create transaction
      const transaction = await this.arweave.createTransaction({
        data: fileBuffer
      }, this.jwk);
      
      // Add secure tags
      const securityTags = this.createSecurityTags(uploadData, checksum);
      Object.entries(securityTags).forEach(([key, value]) => {
        transaction.addTag(key, value);
      });
      
      // Add custom tags (sanitized)
      if (uploadData.tags) {
        Object.entries(uploadData.tags).forEach(([key, value]) => {
          const sanitizedKey = XSSProtection.sanitizeText(key);
          const sanitizedValue = XSSProtection.sanitizeText(value);
          transaction.addTag(sanitizedKey, sanitizedValue);
        });
      }
      
      // Sign and submit transaction
      await this.arweave.transactions.sign(transaction, this.jwk);
      const response = await this.arweave.transactions.post(transaction);
      
      if (response.status !== 200) {
        throw new Error(`Upload failed with status: ${response.status}`);
      }
      
      // Log successful upload
      logSecurityEvent(
        SecurityEventType.AUTHENTICATION_SUCCESS,
        SecurityLevel.LOW,
        {
          action: 'File uploaded successfully',
          transactionId: transaction.id,
          filename: uploadData.file.name,
          fileSize: uploadData.file.size,
          recipient: uploadData.recipient,
          checksum
        }
      );
      
      return transaction.id;
    } catch (error) {
      logSecurityEvent(
        SecurityEventType.SUSPICIOUS_ACTIVITY,
        SecurityLevel.MEDIUM,
        {
          action: 'File upload failed',
          error: error instanceof Error ? error.message : 'Unknown error',
          filename: uploadData.file.name
        }
      );
      throw error;
    }
  }
  
  async getReceivedFilesSecurely(walletAddress: string): Promise<FileMetadata[]> {
    const userIdentifier = getUserIdentifier();
    
    try {
      // Rate limiting
      const rateLimitResult = await rateLimiters.search.checkLimit(userIdentifier);
      if (!rateLimitResult.allowed) {
        throw new Error('Search rate limit exceeded');
      }
      
      // Validate wallet address
      if (!validateWalletAddress(walletAddress)) {
        throw new Error('Invalid wallet address');
      }
      
      // Get all recipient identifiers (address + ENS names)
      const recipientIdentifiers = await this.getAllRecipientIdentifiers(walletAddress);
      
      const allFiles: FileMetadata[] = [];
      
      for (const identifier of recipientIdentifiers) {
        const query = {
          query: `{
            transactions(
              tags: [
                { name: "App-Name", values: ["TUMA"] },
                { name: "Recipient", values: ["${identifier}"] }
              ]
              first: 10000
            ) {
              edges {
                node {
                  id
                  tags {
                    name
                    value
                  }
                  block {
                    timestamp
                  }
                }
              }
            }
          }`
        };
        
        const response = await fetch('https://arweave.net/graphql', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(query)
        });
        
        const data = await response.json();
        
        if (data.data?.transactions?.edges) {
          const files = data.data.transactions.edges.map((edge: any) => 
            this.parseFileMetadata(edge.node)
          ).filter((file: FileMetadata | null) => file !== null);
          
          allFiles.push(...files);
        }
      }
      
      // Remove duplicates and sort by upload date
      const uniqueFiles = this.removeDuplicateFiles(allFiles);
      
      logSecurityEvent(
        SecurityEventType.AUTHENTICATION_SUCCESS,
        SecurityLevel.LOW,
        {
          action: 'Retrieved received files',
          walletAddress,
          fileCount: uniqueFiles.length
        }
      );
      
      return uniqueFiles;
    } catch (error) {
      logSecurityEvent(
        SecurityEventType.SUSPICIOUS_ACTIVITY,
        SecurityLevel.MEDIUM,
        {
          action: 'Failed to retrieve received files',
          walletAddress,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      );
      throw error;
    }
  }
  
  async getSentFilesSecurely(walletAddress: string): Promise<FileMetadata[]> {
    const userIdentifier = getUserIdentifier();
    
    try {
      // Rate limiting
      const rateLimitResult = await rateLimiters.search.checkLimit(userIdentifier);
      if (!rateLimitResult.allowed) {
        throw new Error('Search rate limit exceeded');
      }
      
      // Validate wallet address
      if (!validateWalletAddress(walletAddress)) {
        throw new Error('Invalid wallet address');
      }
      
      const query = {
        query: `{
          transactions(
            owners: ["${walletAddress}"]
            tags: [
              { name: "App-Name", values: ["TUMA"] }
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
                block {
                  timestamp
                }
              }
            }
          }
        }`
      };
      
      const response = await fetch('https://arweave.net/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(query)
      });
      
      const data = await response.json();
      
      if (!data.data?.transactions?.edges) {
        return [];
      }
      
      const files = data.data.transactions.edges
        .map((edge: any) => this.parseFileMetadata(edge.node))
        .filter((file: FileMetadata | null) => file !== null)
        .sort((a: FileMetadata, b: FileMetadata) => b.uploadedAt - a.uploadedAt);
      
      logSecurityEvent(
        SecurityEventType.AUTHENTICATION_SUCCESS,
        SecurityLevel.LOW,
        {
          action: 'Retrieved sent files',
          walletAddress,
          fileCount: files.length
        }
      );
      
      return files;
    } catch (error) {
      logSecurityEvent(
        SecurityEventType.SUSPICIOUS_ACTIVITY,
        SecurityLevel.MEDIUM,
        {
          action: 'Failed to retrieve sent files',
          walletAddress,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      );
      throw error;
    }
  }
  
  private validateRecipient(recipient: string): boolean {
    return validateWalletAddress(recipient) || validateENSName(recipient);
  }
  
  private async scanFileForThreats(file: File): Promise<SecurityScanResult> {
    const threats: string[] = [];
    let risk: 'low' | 'medium' | 'high' | 'critical' = 'low';
    
    // Check file size
    if (file.size > this.MAX_FILE_SIZE) {
      threats.push('File too large');
      risk = 'high';
    }
    
    // Check for suspicious file extensions
    const suspiciousExtensions = [
      '.exe', '.bat', '.cmd', '.scr', '.pif', '.com',
      '.js', '.vbs', '.jar', '.app', '.deb', '.rpm'
    ];
    
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (suspiciousExtensions.includes(fileExtension)) {
      threats.push('Potentially dangerous file type');
      risk = 'critical';
    }
    
    // Check file name for suspicious patterns
    const suspiciousPatterns = [
      /\.(exe|bat|cmd|scr|pif|com)$/i,
      /[<>:"|?*]/,
      /\.\./, // Path traversal
      /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i // Windows reserved names
    ];
    
    if (suspiciousPatterns.some(pattern => pattern.test(file.name))) {
      threats.push('Suspicious file name');
      risk = 'high';
    }
    
    // Basic content scanning for text files
    if (file.type.startsWith('text/') || file.name.endsWith('.html') || file.name.endsWith('.js')) {
      try {
        const content = await file.text();
        const maliciousPatterns = [
          /<script[^>]*>.*?<\/script>/gi,
          /javascript:/gi,
          /vbscript:/gi,
          /on\w+\s*=/gi,
          /eval\s*\(/gi,
          /document\.write/gi
        ];
        
        if (maliciousPatterns.some(pattern => pattern.test(content))) {
          threats.push('Potentially malicious content detected');
          risk = 'critical';
        }
      } catch {
        // If we can't read the file, treat it as suspicious
        threats.push('Unable to scan file content');
        risk = 'medium';
      }
    }
    
    return {
      safe: threats.length === 0,
      threats,
      risk
    };
  }
  
  private async calculateFileChecksum(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  
  private createSecurityTags(uploadData: SecureFileUpload, checksum: string): Record<string, string> {
    return {
      'App-Name': 'TUMA',
      'App-Version': '2.0.0',
      'Content-Type': uploadData.file.type,
      'File-Name': uploadData.file.name,
      'File-Size': uploadData.file.size.toString(),
      'Recipient': uploadData.recipient,
      'Upload-Timestamp': Date.now().toString(),
      'File-Checksum': checksum,
      'Security-Scanned': 'true',
      'Description': uploadData.description || ''
    };
  }
  
  private parseFileMetadata(node: any): FileMetadata | null {
    try {
      const tags = node.tags.reduce((acc: any, tag: any) => {
        acc[tag.name] = tag.value;
        return acc;
      }, {});
      
      return {
        id: node.id,
        filename: tags['File-Name'] || 'Unknown',
        size: parseInt(tags['File-Size']) || 0,
        type: tags['Content-Type'] || 'application/octet-stream',
        uploadedAt: parseInt(tags['Upload-Timestamp']) || (node.block?.timestamp * 1000) || Date.now(),
        sender: tags['Sender'] || 'Unknown',
        recipient: tags['Recipient'] || 'Unknown',
        description: tags['Description'] || undefined,
        checksum: tags['File-Checksum'] || '',
        encrypted: tags['Encrypted'] === 'true'
      };
    } catch (error) {
      console.error('Failed to parse file metadata:', error);
      return null;
    }
  }
  
  private removeDuplicateFiles(files: FileMetadata[]): FileMetadata[] {
    const seen = new Set<string>();
    return files.filter(file => {
      if (seen.has(file.id)) {
        return false;
      }
      seen.add(file.id);
      return true;
    }).sort((a, b) => b.uploadedAt - a.uploadedAt);
  }
  
  private async getAllRecipientIdentifiers(walletAddress: string): Promise<string[]> {
    const identifiers = [walletAddress];
    
    try {
      // Try to resolve address to ENS name
      const ensName = await this.resolveAddressToName(walletAddress);
      if (ensName) {
        identifiers.push(ensName);
      }
    } catch (error) {
      // Ignore resolution errors
    }
    
    return identifiers;
  }
  
  private async resolveAddressToName(address: string): Promise<string | null> {
    // Check cache first
    const cached = this.addressCache.get(address);
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.name;
    }
    
    try {
      // This would typically use an ENS resolver or similar service
      // For now, return null as we don't have a resolver configured
      return null;
    } catch (error) {
      return null;
    }
  }
}

// Export singleton instance
export const secureArweaveService = SecureArweaveService.getInstance();