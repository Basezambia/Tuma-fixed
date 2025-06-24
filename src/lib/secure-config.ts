import { logSecurityEvent, SecurityEventType, SecurityLevel } from './security-monitor';

interface ConfigValidation {
  required: boolean;
  pattern?: RegExp;
  minLength?: number;
  maxLength?: number;
  validator?: (value: string) => boolean;
}

interface SecureConfigSchema {
  [key: string]: ConfigValidation;
}

export class SecureConfigManager {
  private static instance: SecureConfigManager;
  private config: Map<string, string> = new Map();
  private sensitiveKeys: Set<string> = new Set();
  private schema: SecureConfigSchema = {};
  
  private constructor() {
    this.initializeSchema();
    this.loadConfiguration();
  }
  
  static getInstance(): SecureConfigManager {
    if (!SecureConfigManager.instance) {
      SecureConfigManager.instance = new SecureConfigManager();
    }
    return SecureConfigManager.instance;
  }
  
  private initializeSchema(): void {
    this.schema = {
      // Arweave configuration
      VITE_ARWEAVE_JWK: {
        required: true,
        minLength: 100,
        validator: this.validateJWK
      },
      
      // Supabase configuration
      VITE_SUPABASE_URL: {
        required: true,
        pattern: /^https:\/\/[a-zA-Z0-9-]+\.supabase\.co$/,
        validator: this.validateURL
      },
      VITE_SUPABASE_ANON_KEY: {
        required: true,
        minLength: 100,
        pattern: /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/
      },
      
      // API Keys
      VITE_COINBASE_COMMERCE_API_KEY: {
        required: false,
        minLength: 20
      },
      VITE_ONCHAINKIT_API_KEY: {
        required: false,
        minLength: 20
      },
      VITE_WALLETCONNECT_PROJECT_ID: {
        required: false,
        pattern: /^[a-f0-9]{32}$/
      },
      
      // Security configuration
      VITE_JWT_SECRET: {
        required: true,
        minLength: 32,
        validator: this.validateJWTSecret
      },
      VITE_ENCRYPTION_KEY: {
        required: false,
        minLength: 32
      },
      
      // Monitoring
      VITE_SECURITY_WEBHOOK_URL: {
        required: false,
        validator: this.validateURL
      },
      
      // Environment
      VITE_ENVIRONMENT: {
        required: true,
        pattern: /^(development|staging|production)$/
      }
    };
    
    // Mark sensitive keys
    this.sensitiveKeys.add('VITE_ARWEAVE_JWK');
    this.sensitiveKeys.add('VITE_SUPABASE_ANON_KEY');
    this.sensitiveKeys.add('VITE_COINBASE_COMMERCE_API_KEY');
    this.sensitiveKeys.add('VITE_ONCHAINKIT_API_KEY');
    this.sensitiveKeys.add('VITE_JWT_SECRET');
    this.sensitiveKeys.add('VITE_ENCRYPTION_KEY');
  }
  
  private loadConfiguration(): void {
    try {
      // Load from environment variables
      Object.keys(this.schema).forEach(key => {
        const value = import.meta.env[key];
        if (value) {
          this.config.set(key, value);
        }
      });
      
      // Validate configuration
      this.validateConfiguration();
      
      console.log('Configuration loaded successfully');
    } catch (error) {
      console.error('Failed to load configuration:', error);
      throw new Error('Configuration loading failed');
    }
  }
  
  private validateConfiguration(): void {
    const errors: string[] = [];
    
    Object.entries(this.schema).forEach(([key, validation]) => {
      const value = this.config.get(key);
      
      // Check required fields
      if (validation.required && !value) {
        errors.push(`Missing required configuration: ${key}`);
        return;
      }
      
      if (!value) return; // Skip validation for optional missing values
      
      // Validate pattern
      if (validation.pattern && !validation.pattern.test(value)) {
        errors.push(`Invalid format for ${key}`);
        this.logConfigurationError(key, 'Invalid format');
      }
      
      // Validate length
      if (validation.minLength && value.length < validation.minLength) {
        errors.push(`${key} is too short (minimum ${validation.minLength} characters)`);
        this.logConfigurationError(key, 'Too short');
      }
      
      if (validation.maxLength && value.length > validation.maxLength) {
        errors.push(`${key} is too long (maximum ${validation.maxLength} characters)`);
        this.logConfigurationError(key, 'Too long');
      }
      
      // Custom validation
      if (validation.validator && !validation.validator(value)) {
        errors.push(`Custom validation failed for ${key}`);
        this.logConfigurationError(key, 'Custom validation failed');
      }
    });
    
    if (errors.length > 0) {
      console.error('Configuration validation errors:', errors);
      throw new Error(`Configuration validation failed: ${errors.join(', ')}`);
    }
  }
  
  get(key: string): string | undefined {
    const value = this.config.get(key);
    
    if (!value && this.schema[key]?.required) {
      this.logConfigurationError(key, 'Missing required value');
      throw new Error(`Missing required configuration: ${key}`);
    }
    
    return value;
  }
  
  getRequired(key: string): string {
    const value = this.get(key);
    if (!value) {
      throw new Error(`Required configuration missing: ${key}`);
    }
    return value;
  }
  
  set(key: string, value: string): void {
    // Validate the new value
    const validation = this.schema[key];
    if (validation) {
      if (validation.pattern && !validation.pattern.test(value)) {
        throw new Error(`Invalid format for ${key}`);
      }
      
      if (validation.minLength && value.length < validation.minLength) {
        throw new Error(`${key} is too short`);
      }
      
      if (validation.validator && !validation.validator(value)) {
        throw new Error(`Custom validation failed for ${key}`);
      }
    }
    
    this.config.set(key, value);
    
    logSecurityEvent(
      SecurityEventType.SUSPICIOUS_ACTIVITY,
      SecurityLevel.MEDIUM,
      {
        action: 'Configuration updated',
        key: this.sensitiveKeys.has(key) ? '[SENSITIVE]' : key,
        timestamp: Date.now()
      }
    );
  }
  
  has(key: string): boolean {
    return this.config.has(key);
  }
  
  isProduction(): boolean {
    return this.get('VITE_ENVIRONMENT') === 'production';
  }
  
  isDevelopment(): boolean {
    return this.get('VITE_ENVIRONMENT') === 'development';
  }
  
  getSecureHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin'
    };
    
    if (this.isProduction()) {
      headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
    }
    
    return headers;
  }
  
  exportSafeConfig(): Record<string, any> {
    const safeConfig: Record<string, any> = {};
    
    this.config.forEach((value, key) => {
      if (this.sensitiveKeys.has(key)) {
        safeConfig[key] = '[REDACTED]';
      } else {
        safeConfig[key] = value;
      }
    });
    
    return safeConfig;
  }
  
  private validateJWK(value: string): boolean {
    try {
      const jwk = JSON.parse(value);
      return jwk.kty && jwk.n && jwk.e && jwk.d;
    } catch {
      return false;
    }
  }
  
  private validateURL(value: string): boolean {
    try {
      const url = new URL(value);
      return url.protocol === 'https:';
    } catch {
      return false;
    }
  }
  
  private validateJWTSecret(value: string): boolean {
    // JWT secret should be cryptographically strong
    const hasUppercase = /[A-Z]/.test(value);
    const hasLowercase = /[a-z]/.test(value);
    const hasNumbers = /[0-9]/.test(value);
    const hasSpecialChars = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(value);
    
    return hasUppercase && hasLowercase && hasNumbers && hasSpecialChars;
  }
  
  private logConfigurationError(key: string, error: string): void {
    logSecurityEvent(
      SecurityEventType.SUSPICIOUS_ACTIVITY,
      SecurityLevel.MEDIUM,
      {
        action: 'Configuration validation error',
        key: this.sensitiveKeys.has(key) ? '[SENSITIVE]' : key,
        error,
        timestamp: Date.now()
      }
    );
  }
}

// Encryption utilities for sensitive data
export class DataEncryption {
  private static encoder = new TextEncoder();
  private static decoder = new TextDecoder();
  
  static async generateKey(): Promise<CryptoKey> {
    return await crypto.subtle.generateKey(
      {
        name: 'AES-GCM',
        length: 256
      },
      true,
      ['encrypt', 'decrypt']
    );
  }
  
  static async encrypt(data: string, key: CryptoKey): Promise<{ encrypted: ArrayBuffer; iv: Uint8Array }> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encodedData = this.encoder.encode(data);
    
    const encrypted = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      key,
      encodedData
    );
    
    return { encrypted, iv };
  }
  
  static async decrypt(encryptedData: ArrayBuffer, key: CryptoKey, iv: Uint8Array): Promise<string> {
    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      key,
      encryptedData
    );
    
    return this.decoder.decode(decrypted);
  }
  
  static async encryptSensitiveData(data: string): Promise<string> {
    const config = SecureConfigManager.getInstance();
    const encryptionKey = config.get('VITE_ENCRYPTION_KEY');
    
    if (!encryptionKey) {
      throw new Error('Encryption key not configured');
    }
    
    // In a real implementation, you'd derive a key from the encryption key
    // For now, we'll use a simple base64 encoding (NOT SECURE for production)
    return btoa(data);
  }
  
  static async decryptSensitiveData(encryptedData: string): Promise<string> {
    const config = SecureConfigManager.getInstance();
    const encryptionKey = config.get('VITE_ENCRYPTION_KEY');
    
    if (!encryptionKey) {
      throw new Error('Encryption key not configured');
    }
    
    // In a real implementation, you'd use proper decryption
    // For now, we'll use simple base64 decoding (NOT SECURE for production)
    try {
      return atob(encryptedData);
    } catch {
      throw new Error('Failed to decrypt data');
    }
  }
}

// Export singleton instance
export const secureConfig = SecureConfigManager.getInstance();

// Environment-specific configuration
export const getEnvironmentConfig = () => {
  const config = SecureConfigManager.getInstance();
  
  return {
    isDevelopment: config.isDevelopment(),
    isProduction: config.isProduction(),
    arweaveConfig: {
      jwk: config.get('VITE_ARWEAVE_JWK')
    },
    supabaseConfig: {
      url: config.getRequired('VITE_SUPABASE_URL'),
      anonKey: config.getRequired('VITE_SUPABASE_ANON_KEY')
    },
    apiKeys: {
      coinbase: config.get('VITE_COINBASE_COMMERCE_API_KEY'),
      onchainkit: config.get('VITE_ONCHAINKIT_API_KEY'),
      walletconnect: config.get('VITE_WALLETCONNECT_PROJECT_ID')
    },
    security: {
      jwtSecret: config.get('VITE_JWT_SECRET'),
      webhookUrl: config.get('VITE_SECURITY_WEBHOOK_URL')
    }
  };
};