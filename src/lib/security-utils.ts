import DOMPurify from 'dompurify';
import validator from 'validator';

// Input sanitization utilities
export const sanitizeInput = (input: string): string => {
  return DOMPurify.sanitize(validator.escape(input));
};

export const validateENSName = (name: string): boolean => {
  const ensRegex = /^[a-zA-Z0-9-]+\.(eth|base\.eth)$/;
  return ensRegex.test(name) && name.length <= 255;
};

export const validateWalletAddress = (address: string): boolean => {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
};

export const validateFileUpload = (file: File): { valid: boolean; error?: string } => {
  const maxSize = 100 * 1024 * 1024; // 100MB
  const allowedTypes = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'text/plain',
    'text/csv',
    'application/json',
    'application/zip',
    'application/x-zip-compressed'
  ];
  
  if (file.size > maxSize) {
    return { valid: false, error: 'File too large (max 100MB)' };
  }
  
  if (!allowedTypes.includes(file.type)) {
    return { valid: false, error: 'File type not allowed' };
  }
  
  // Check file name for suspicious patterns
  const suspiciousPatterns = [
    /\.(exe|bat|cmd|scr|pif|com)$/i,
    /\.(js|vbs|jar|app)$/i,
    /[<>:"|?*]/,
    /\.\./, // Path traversal
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i // Windows reserved names
  ];
  
  if (suspiciousPatterns.some(pattern => pattern.test(file.name))) {
    return { valid: false, error: 'Suspicious file name detected' };
  }
  
  return { valid: true };
};

// URL validation
export const validateURL = (url: string): boolean => {
  try {
    const urlObj = new URL(url);
    const allowedProtocols = ['http:', 'https:'];
    return allowedProtocols.includes(urlObj.protocol);
  } catch {
    return false;
  }
};

// Email validation
export const validateEmail = (email: string): boolean => {
  return validator.isEmail(email) && email.length <= 254;
};

// Password strength validation
export const validatePassword = (password: string): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }
  
  return { valid: errors.length === 0, errors };
};

// Sanitize object for logging (remove sensitive data)
export const sanitizeForLogging = (obj: any): any => {
  const sensitiveKeys = [
    'password', 'privateKey', 'secret', 'token', 'key',
    'authorization', 'cookie', 'session', 'jwt'
  ];
  
  const sanitized = JSON.parse(JSON.stringify(obj));
  
  const sanitizeRecursive = (item: any): any => {
    if (typeof item === 'object' && item !== null) {
      if (Array.isArray(item)) {
        return item.map(sanitizeRecursive);
      }
      
      const result: any = {};
      for (const [key, value] of Object.entries(item)) {
        const lowerKey = key.toLowerCase();
        if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive))) {
          result[key] = '[REDACTED]';
        } else {
          result[key] = sanitizeRecursive(value);
        }
      }
      return result;
    }
    return item;
  };
  
  return sanitizeRecursive(sanitized);
};