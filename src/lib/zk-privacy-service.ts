// Zero-Knowledge Privacy Service
import { supabase } from './supabase-auth';
import {
  ZKProof,
  PrivacySettings,
  EncryptedData,
  ApiResponse,
  ZKKeyPair,
} from '../types/enterprise';

interface KeyPair {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}

interface EncryptionResult {
  encryptedData: ArrayBuffer;
  iv: Uint8Array;
  salt: Uint8Array;
}

interface ZKCircuit {
  id: string;
  name: string;
  description: string;
  wasmPath: string;
  zkeyPath: string;
}

interface ProofGenerationInput {
  circuit: string;
  inputs: Record<string, any>;
  publicSignals?: string[];
}

class ZKPrivacyService {
  private static instance: ZKPrivacyService;
  private keyCache = new Map<string, KeyPair>();
  private circuitCache = new Map<string, ZKCircuit>();

  public static getInstance(): ZKPrivacyService {
    if (!ZKPrivacyService.instance) {
      ZKPrivacyService.instance = new ZKPrivacyService();
    }
    return ZKPrivacyService.instance;
  }

  // Key Management
  async generateKeyPair(): Promise<KeyPair> {
    try {
      const keyPair = await window.crypto.subtle.generateKey(
        {
          name: 'RSA-OAEP',
          modulusLength: 2048,
          publicExponent: new Uint8Array([1, 0, 1]),
          hash: 'SHA-256',
        },
        true,
        ['encrypt', 'decrypt']
      );

      return {
        publicKey: keyPair.publicKey,
        privateKey: keyPair.privateKey,
      };
    } catch (error) {
      throw new Error(`Key generation failed: ${(error as Error).message}`);
    }
  }

  async exportPublicKey(publicKey: CryptoKey): Promise<string> {
    try {
      const exported = await window.crypto.subtle.exportKey('spki', publicKey);
      const exportedAsBase64 = btoa(String.fromCharCode(...new Uint8Array(exported)));
      return `-----BEGIN PUBLIC KEY-----\n${exportedAsBase64}\n-----END PUBLIC KEY-----`;
    } catch (error) {
      throw new Error(`Public key export failed: ${(error as Error).message}`);
    }
  }

  async importPublicKey(pemKey: string): Promise<CryptoKey> {
    try {
      const pemContents = pemKey
        .replace('-----BEGIN PUBLIC KEY-----', '')
        .replace('-----END PUBLIC KEY-----', '')
        .replace(/\s/g, '');
      
      const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
      
      return await window.crypto.subtle.importKey(
        'spki',
        binaryDer,
        {
          name: 'RSA-OAEP',
          hash: 'SHA-256',
        },
        true,
        ['encrypt']
      );
    } catch (error) {
      throw new Error(`Public key import failed: ${(error as Error).message}`);
    }
  }

  async storeKeyPair(userId: string, keyPair: KeyPair): Promise<ApiResponse<void>> {
    try {
      const publicKeyPem = await this.exportPublicKey(keyPair.publicKey);
      const privateKeyJwk = await window.crypto.subtle.exportKey('jwk', keyPair.privateKey);

      // Store public key in database, private key in secure local storage
      const { error } = await supabase
        .from('user_keys')
        .upsert({
          user_id: userId,
          public_key: publicKeyPem,
          created_at: new Date().toISOString(),
        });

      if (error) throw error;

      // Store private key securely in browser
      localStorage.setItem(`zk_private_key_${userId}`, JSON.stringify(privateKeyJwk));
      this.keyCache.set(userId, keyPair);

      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async getKeyPair(userId: string): Promise<KeyPair | null> {
    try {
      // Check cache first
      if (this.keyCache.has(userId)) {
        return this.keyCache.get(userId)!;
      }

      // Get public key from database
      const { data: keyData, error } = await supabase
        .from('user_keys')
        .select('public_key')
        .eq('user_id', userId)
        .single();

      if (error || !keyData) return null;

      // Get private key from local storage
      const privateKeyJwk = localStorage.getItem(`zk_private_key_${userId}`);
      if (!privateKeyJwk) return null;

      const publicKey = await this.importPublicKey(keyData.public_key);
      const privateKey = await window.crypto.subtle.importKey(
        'jwk',
        JSON.parse(privateKeyJwk),
        {
          name: 'RSA-OAEP',
          hash: 'SHA-256',
        },
        true,
        ['decrypt']
      );

      const keyPair = { publicKey, privateKey };
      this.keyCache.set(userId, keyPair);
      return keyPair;
    } catch (error) {
      console.error('Failed to get key pair:', error);
      return null;
    }
  }

  // Encryption/Decryption
  async encryptData(data: string, publicKey: CryptoKey): Promise<EncryptionResult> {
    try {
      // Generate random salt and IV
      const salt = window.crypto.getRandomValues(new Uint8Array(16));
      const iv = window.crypto.getRandomValues(new Uint8Array(12));

      // Convert string to ArrayBuffer
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(data);

      // For large data, use AES-GCM with RSA-encrypted key
      if (dataBuffer.length > 190) { // RSA-OAEP limit
        return await this.encryptLargeData(data, salt, iv);
      }

      // Direct RSA encryption for small data
      const encryptedData = await window.crypto.subtle.encrypt(
        {
          name: 'RSA-OAEP',
        },
        publicKey,
        dataBuffer
      );

      return {
        encryptedData,
        iv,
        salt,
      };
    } catch (error) {
      throw new Error(`Encryption failed: ${(error as Error).message}`);
    }
  }

  private async encryptLargeData(data: string, salt: Uint8Array, iv: Uint8Array): Promise<EncryptionResult> {
    // Generate AES key
    const aesKey = await window.crypto.subtle.generateKey(
      {
        name: 'AES-GCM',
        length: 256,
      },
      true,
      ['encrypt', 'decrypt']
    );

    // Encrypt data with AES
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    
    const encryptedData = await window.crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv,
      },
      aesKey,
      dataBuffer
    );

    // Export AES key and store it (in real implementation, encrypt with RSA)
    const exportedKey = await window.crypto.subtle.exportKey('raw', aesKey);
    
    // Combine encrypted data with key info
    const combined = new Uint8Array(exportedKey.byteLength + encryptedData.byteLength + 4);
    const keyLengthView = new DataView(combined.buffer, 0, 4);
    keyLengthView.setUint32(0, exportedKey.byteLength);
    combined.set(new Uint8Array(exportedKey), 4);
    combined.set(new Uint8Array(encryptedData), 4 + exportedKey.byteLength);

    return {
      encryptedData: combined.buffer,
      iv,
      salt,
    };
  }

  async decryptData(encryptedResult: EncryptionResult, privateKey: CryptoKey): Promise<string> {
    try {
      // Check if this is large data encryption
      if (encryptedResult.encryptedData.byteLength > 256) {
        return await this.decryptLargeData(encryptedResult);
      }

      // Direct RSA decryption
      const decryptedBuffer = await window.crypto.subtle.decrypt(
        {
          name: 'RSA-OAEP',
        },
        privateKey,
        encryptedResult.encryptedData
      );

      const decoder = new TextDecoder();
      return decoder.decode(decryptedBuffer);
    } catch (error) {
      throw new Error(`Decryption failed: ${(error as Error).message}`);
    }
  }

  private async decryptLargeData(encryptedResult: EncryptionResult): Promise<string> {
    const combined = new Uint8Array(encryptedResult.encryptedData);
    const keyLengthView = new DataView(combined.buffer, 0, 4);
    const keyLength = keyLengthView.getUint32(0);
    
    const keyData = combined.slice(4, 4 + keyLength);
    const encryptedData = combined.slice(4 + keyLength);

    // Import AES key
    const aesKey = await window.crypto.subtle.importKey(
      'raw',
      keyData,
      {
        name: 'AES-GCM',
      },
      false,
      ['decrypt']
    );

    // Decrypt data
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: encryptedResult.iv,
      },
      aesKey,
      encryptedData
    );

    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
  }

  // Zero-Knowledge Proofs (Simplified Implementation)
  async generateProof(input: ProofGenerationInput): Promise<ApiResponse<ZKProof>> {
    try {
      // In a real implementation, this would use libraries like snarkjs
      // For now, we'll create a simplified proof structure
      
      const circuit = await this.getCircuit(input.circuit);
      if (!circuit) {
        throw new Error(`Circuit ${input.circuit} not found`);
      }

      // Simulate proof generation
      const proof = await this.simulateProofGeneration(input, circuit);
      
      const zkProof: ZKProof = {
        proof: proof,
        publicSignals: input.publicSignals || [],
        verificationKey: circuit.zkeyPath,
      };

      // Store proof in database with additional fields
      const proofRecord = {
        id: crypto.randomUUID(),
        circuit_id: circuit.id,
        proof_data: proof,
        public_signals: input.publicSignals || [],
        verification_key: circuit.zkeyPath,
        created_at: new Date().toISOString(),
      };

      // Store proof in database
      const { error } = await supabase
        .from('zk_proofs')
        .insert(proofRecord);

      if (error) throw error;

      return { success: true, data: zkProof };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  private async getCircuit(circuitId: string): Promise<ZKCircuit | null> {
    if (this.circuitCache.has(circuitId)) {
      return this.circuitCache.get(circuitId)!;
    }

    // In a real implementation, load from database or file system
    const circuits: Record<string, ZKCircuit> = {
      'file_ownership': {
        id: 'file_ownership',
        name: 'File Ownership Proof',
        description: 'Proves ownership of a file without revealing the file content',
        wasmPath: '/circuits/file_ownership.wasm',
        zkeyPath: '/circuits/file_ownership_final.zkey',
      },
      'access_control': {
        id: 'access_control',
        name: 'Access Control Proof',
        description: 'Proves access rights without revealing identity',
        wasmPath: '/circuits/access_control.wasm',
        zkeyPath: '/circuits/access_control_final.zkey',
      },
    };

    const circuit = circuits[circuitId] || null;
    if (circuit) {
      this.circuitCache.set(circuitId, circuit);
    }
    return circuit;
  }

  private async simulateProofGeneration(input: ProofGenerationInput, circuit: ZKCircuit): Promise<any> {
    // Simulate proof generation delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Generate a mock proof structure
    return {
      pi_a: this.generateRandomPoint(),
      pi_b: [this.generateRandomPoint(), this.generateRandomPoint()],
      pi_c: this.generateRandomPoint(),
      protocol: 'groth16',
      curve: 'bn128',
    };
  }

  private generateRandomPoint(): [string, string] {
    const randomHex = () => '0x' + Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    return [randomHex(), randomHex()];
  }

  async verifyProof(proofId: string): Promise<ApiResponse<boolean>> {
    try {
      const { data: proof, error } = await supabase
        .from('zk_proofs')
        .select('*')
        .eq('id', proofId)
        .single();

      if (error || !proof) {
        throw new Error('Proof not found');
      }

      // In a real implementation, this would verify the actual proof
      // For now, we'll simulate verification
      const isValid = await this.simulateProofVerification(proof);

      return { success: true, data: isValid };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  private async simulateProofVerification(proof: any): Promise<boolean> {
    // Simulate verification delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // For simulation, randomly return true/false with high probability of true
    return Math.random() > 0.1;
  }

  // Privacy Settings Management
  async updatePrivacySettings(userId: string, settings: Partial<PrivacySettings>): Promise<ApiResponse<PrivacySettings>> {
    try {
      const { data: existing, error: fetchError } = await supabase
        .from('user_privacy_settings')
        .select('*')
        .eq('user_id', userId)
        .single();

      const updatedSettings = {
        user_id: userId,
        ...existing,
        ...settings,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('user_privacy_settings')
        .upsert(updatedSettings)
        .select()
        .single();

      if (error) throw error;

      return { success: true, data };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async getPrivacySettings(userId: string): Promise<ApiResponse<PrivacySettings>> {
    try {
      const { data, error } = await supabase
        .from('user_privacy_settings')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') { // Not found error
        throw error;
      }

      // Return default settings if none exist
      const defaultSettings: PrivacySettings = {
        id: crypto.randomUUID(),
        user_id: userId,
        stealth_mode_enabled: false,
        metadata_obfuscation: false,
        zero_knowledge_proofs: false,
        anonymous_uploads: false,
        privacy_level: 'basic',
        encryption_enabled: false,
        encryption_level: 'standard',
        auto_delete_expired: false,
        require_proof_for_access: false,
        anonymous_sharing: false,
        default_expiration_days: 30,
        client_side_encryption: false,
        metadata_protection: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      return { success: true, data: data || defaultSettings };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  // Secure File Sharing
  async createSecureShare(fileId: string, recipientPublicKey: string, expiresAt?: Date): Promise<ApiResponse<EncryptedData>> {
    try {
      // Get file data (in real implementation, this would be the actual file)
      const fileData = `secure_file_content_${fileId}`;
      
      // Import recipient's public key
      const publicKey = await this.importPublicKey(recipientPublicKey);
      
      // Encrypt file data
      const encryptionResult = await this.encryptData(fileData, publicKey);
      
      // Create encrypted data record
      const encryptedData: EncryptedData = {
        data: btoa(String.fromCharCode(...new Uint8Array(encryptionResult.encryptedData))),
        iv: btoa(String.fromCharCode(...encryptionResult.iv)),
        salt: btoa(String.fromCharCode(...encryptionResult.salt)),
        algorithm: 'AES-GCM',
      };

      // Create database record with additional fields
      const shareRecord = {
        id: crypto.randomUUID(),
        file_id: fileId,
        encrypted_content: encryptedData.data,
        encryption_iv: encryptedData.iv,
        encryption_salt: encryptedData.salt,
        algorithm: encryptedData.algorithm,
        recipient_key_hash: await this.hashPublicKey(publicKey),
        expires_at: expiresAt?.toISOString(),
        created_at: new Date().toISOString(),
      };

      // Store in database
      const { error } = await supabase
        .from('encrypted_shares')
        .insert(shareRecord);

      if (error) throw error;

      return { success: true, data: encryptedData };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  private async hashPublicKey(publicKey: CryptoKey): Promise<string> {
    const exported = await window.crypto.subtle.exportKey('spki', publicKey);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', exported);
    return btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));
  }

  async accessSecureShare(shareId: string, privateKey: CryptoKey): Promise<ApiResponse<string>> {
    try {
      const { data: share, error } = await supabase
        .from('encrypted_shares')
        .select('*')
        .eq('id', shareId)
        .single();

      if (error || !share) {
        throw new Error('Share not found');
      }

      // Check expiration
      if (share.expires_at && new Date(share.expires_at) < new Date()) {
        throw new Error('Share has expired');
      }

      // Reconstruct encryption result
      const encryptionResult: EncryptionResult = {
        encryptedData: Uint8Array.from(atob(share.encrypted_content), c => c.charCodeAt(0)).buffer,
        iv: Uint8Array.from(atob(share.encryption_iv), c => c.charCodeAt(0)),
        salt: Uint8Array.from(atob(share.encryption_salt), c => c.charCodeAt(0)),
      };

      // Decrypt content
      const decryptedContent = await this.decryptData(encryptionResult, privateKey);

      return { success: true, data: decryptedContent };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  // Cleanup expired data
  async cleanupExpiredData(): Promise<void> {
    try {
      const now = new Date().toISOString();
      
      // Clean up expired shares
      await supabase
        .from('encrypted_shares')
        .delete()
        .lt('expires_at', now);

      // Clean up old proofs (older than 30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      await supabase
        .from('zk_proofs')
        .delete()
        .lt('created_at', thirtyDaysAgo);

    } catch (error) {
      console.error('Cleanup failed:', error);
    }
  }



  async getOrGenerateKeyPair(userId: string): Promise<ApiResponse<ZKKeyPair>> {
    try {
      // Try to get existing key pair
      const existingKeyPair = await this.getKeyPair(userId);
      if (existingKeyPair) {
        const publicKeyPem = await this.exportPublicKey(existingKeyPair.publicKey);
        const privateKeyJwk = await window.crypto.subtle.exportKey('jwk', existingKeyPair.privateKey);
        
        return {
          success: true,
          data: {
            publicKey: publicKeyPem,
            privateKey: JSON.stringify(privateKeyJwk),
            created_at: new Date().toISOString(),
          }
        };
      }

      // Generate new key pair
      const newKeyPair = await this.generateKeyPair();
      const storeResult = await this.storeKeyPair(userId, newKeyPair);
      
      if (!storeResult.success) {
        throw new Error(storeResult.error);
      }

      const publicKeyPem = await this.exportPublicKey(newKeyPair.publicKey);
      const privateKeyJwk = await window.crypto.subtle.exportKey('jwk', newKeyPair.privateKey);
      
      return {
        success: true,
        data: {
          publicKey: publicKeyPem,
          privateKey: JSON.stringify(privateKeyJwk),
          created_at: new Date().toISOString(),
        }
      };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async exportKeyPair(userId: string): Promise<ApiResponse<ZKKeyPair>> {
    try {
      const keyPair = await this.getKeyPair(userId);
      if (!keyPair) {
        throw new Error('No key pair found for user');
      }

      const publicKeyPem = await this.exportPublicKey(keyPair.publicKey);
      const privateKeyJwk = await window.crypto.subtle.exportKey('jwk', keyPair.privateKey);
      
      return {
        success: true,
        data: {
          publicKey: publicKeyPem,
          privateKey: JSON.stringify(privateKeyJwk),
          created_at: new Date().toISOString(),
        }
      };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async importKeyPair(userId: string, keyData: { publicKey: string; privateKey: string }): Promise<ApiResponse<void>> {
    try {
      // Import the keys
      const publicKey = await this.importPublicKey(keyData.publicKey);
      const privateKey = await window.crypto.subtle.importKey(
        'jwk',
        JSON.parse(keyData.privateKey),
        {
          name: 'RSA-OAEP',
          hash: 'SHA-256',
        },
        true,
        ['decrypt']
      );

      const keyPair = { publicKey, privateKey };
      const storeResult = await this.storeKeyPair(userId, keyPair);
      
      if (!storeResult.success) {
        throw new Error(storeResult.error);
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  // Utility methods
  async generateSecureHash(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', dataBuffer);
    return btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));
  }

  generateSecureRandom(length: number = 32): string {
    const array = new Uint8Array(length);
    window.crypto.getRandomValues(array);
    return btoa(String.fromCharCode(...array));
  }
}

export const zkPrivacyService = ZKPrivacyService.getInstance();
export default zkPrivacyService;