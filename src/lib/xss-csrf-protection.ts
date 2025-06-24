import DOMPurify from 'dompurify';
import { logSecurityEvent, SecurityEventType, SecurityLevel } from './security-monitor';

// XSS Protection utilities
export class XSSProtection {
  private static suspiciousPatterns = [
    /<script[^>]*>.*?<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    /<iframe[^>]*>/gi,
    /<object[^>]*>/gi,
    /<embed[^>]*>/gi,
    /<link[^>]*>/gi,
    /<meta[^>]*>/gi,
    /expression\s*\(/gi,
    /vbscript:/gi,
    /data:text\/html/gi
  ];
  
  static sanitizeHTML(input: string, allowedTags?: string[]): string {
    try {
      // Check for suspicious patterns before sanitization
      this.detectXSSAttempt(input);
      
      const config = allowedTags ? {
        ALLOWED_TAGS: allowedTags,
        ALLOWED_ATTR: ['class', 'id', 'style'],
        ALLOW_DATA_ATTR: false
      } : {
        ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p', 'br'],
        ALLOWED_ATTR: [],
        ALLOW_DATA_ATTR: false
      };
      
      return DOMPurify.sanitize(input, config);
    } catch (error) {
      console.error('HTML sanitization failed:', error);
      return '';
    }
  }
  
  static sanitizeText(input: string): string {
    // Remove all HTML tags and encode special characters
    return input
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }
  
  static validateInput(input: string, context: 'html' | 'text' | 'url' | 'css'): boolean {
    switch (context) {
      case 'html':
        return this.validateHTMLInput(input);
      case 'text':
        return this.validateTextInput(input);
      case 'url':
        return this.validateURLInput(input);
      case 'css':
        return this.validateCSSInput(input);
      default:
        return false;
    }
  }
  
  private static validateHTMLInput(input: string): boolean {
    // Check for dangerous patterns
    for (const pattern of this.suspiciousPatterns) {
      if (pattern.test(input)) {
        this.detectXSSAttempt(input);
        return false;
      }
    }
    return true;
  }
  
  private static validateTextInput(input: string): boolean {
    // Text should not contain HTML tags or script content
    const htmlPattern = /<[^>]*>/;
    const scriptPattern = /javascript:|vbscript:|data:/i;
    
    if (htmlPattern.test(input) || scriptPattern.test(input)) {
      this.detectXSSAttempt(input);
      return false;
    }
    return true;
  }
  
  private static validateURLInput(input: string): boolean {
    try {
      const url = new URL(input);
      const allowedProtocols = ['http:', 'https:', 'mailto:'];
      
      if (!allowedProtocols.includes(url.protocol)) {
        this.detectXSSAttempt(input);
        return false;
      }
      
      // Check for suspicious URL patterns
      if (/javascript:|vbscript:|data:/i.test(input)) {
        this.detectXSSAttempt(input);
        return false;
      }
      
      return true;
    } catch {
      return false;
    }
  }
  
  private static validateCSSInput(input: string): boolean {
    // Check for dangerous CSS patterns
    const dangerousPatterns = [
      /expression\s*\(/gi,
      /javascript:/gi,
      /vbscript:/gi,
      /data:/gi,
      /@import/gi,
      /behavior:/gi
    ];
    
    for (const pattern of dangerousPatterns) {
      if (pattern.test(input)) {
        this.detectXSSAttempt(input);
        return false;
      }
    }
    return true;
  }
  
  private static detectXSSAttempt(input: string): void {
    logSecurityEvent(
      SecurityEventType.XSS_ATTEMPT,
      SecurityLevel.HIGH,
      {
        input: input.substring(0, 200), // Log first 200 chars
        inputLength: input.length,
        timestamp: Date.now()
      }
    );
  }
}

// CSRF Protection utilities
export class CSRFProtection {
  private static tokens: Map<string, { token: string; expires: number }> = new Map();
  private static readonly TOKEN_EXPIRY = 60 * 60 * 1000; // 1 hour
  
  static generateToken(sessionId: string): string {
    const token = crypto.randomUUID();
    const expires = Date.now() + this.TOKEN_EXPIRY;
    
    this.tokens.set(sessionId, { token, expires });
    
    // Clean up expired tokens
    this.cleanupExpiredTokens();
    
    return token;
  }
  
  static validateToken(sessionId: string, token: string): boolean {
    const storedToken = this.tokens.get(sessionId);
    
    if (!storedToken) {
      return false;
    }
    
    if (Date.now() > storedToken.expires) {
      this.tokens.delete(sessionId);
      return false;
    }
    
    return storedToken.token === token;
  }
  
  static revokeToken(sessionId: string): void {
    this.tokens.delete(sessionId);
  }
  
  static createSecureHeaders(): Record<string, string> {
    return {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
    };
  }
  
  private static cleanupExpiredTokens(): void {
    const now = Date.now();
    for (const [sessionId, tokenData] of this.tokens.entries()) {
      if (now > tokenData.expires) {
        this.tokens.delete(sessionId);
      }
    }
  }
}

// Content Security Policy utilities
export class CSPManager {
  private static defaultPolicy = {
    'default-src': ["'self'"],
    'script-src': ["'self'", "'unsafe-inline'"], // Note: unsafe-inline should be avoided in production
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'https:'],
    'font-src': ["'self'", 'https:'],
    'connect-src': ["'self'", 'https:'],
    'media-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
    'upgrade-insecure-requests': []
  };
  
  static generateCSPHeader(customPolicy?: Record<string, string[]>): string {
    const policy = { ...this.defaultPolicy, ...customPolicy };
    
    return Object.entries(policy)
      .map(([directive, sources]) => {
        if (sources.length === 0) {
          return directive;
        }
        return `${directive} ${sources.join(' ')}`;
      })
      .join('; ');
  }
  
  static applyCSP(customPolicy?: Record<string, string[]>): void {
    const cspHeader = this.generateCSPHeader(customPolicy);
    
    // Create meta tag for CSP
    const meta = document.createElement('meta');
    meta.httpEquiv = 'Content-Security-Policy';
    meta.content = cspHeader;
    
    // Remove existing CSP meta tag if present
    const existingMeta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    if (existingMeta) {
      existingMeta.remove();
    }
    
    document.head.appendChild(meta);
  }
  
  static createNonce(): string {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode(...array));
  }
}

// Secure form utilities
export class SecureFormHandler {
  private static formTokens: Map<string, string> = new Map();
  
  static createSecureForm(formId: string, sessionId: string): {
    csrfToken: string;
    nonce: string;
    formHandler: (event: Event) => boolean;
  } {
    const csrfToken = CSRFProtection.generateToken(sessionId);
    const nonce = CSPManager.createNonce();
    
    this.formTokens.set(formId, csrfToken);
    
    const formHandler = (event: Event): boolean => {
      return this.validateFormSubmission(event, formId, sessionId);
    };
    
    return { csrfToken, nonce, formHandler };
  }
  
  static validateFormSubmission(event: Event, formId: string, sessionId: string): boolean {
    const form = event.target as HTMLFormElement;
    const formData = new FormData(form);
    const submittedToken = formData.get('csrf_token') as string;
    const expectedToken = this.formTokens.get(formId);
    
    if (!expectedToken || !CSRFProtection.validateToken(sessionId, submittedToken)) {
      event.preventDefault();
      
      logSecurityEvent(
        SecurityEventType.SUSPICIOUS_ACTIVITY,
        SecurityLevel.HIGH,
        {
          formId,
          reason: 'Invalid CSRF token',
          submittedToken: submittedToken?.substring(0, 10) + '...',
          timestamp: Date.now()
        }
      );
      
      return false;
    }
    
    // Validate all form inputs
    const inputs = form.querySelectorAll('input, textarea, select');
    for (const input of inputs) {
      const element = input as HTMLInputElement;
      if (!this.validateFormInput(element)) {
        event.preventDefault();
        return false;
      }
    }
    
    return true;
  }
  
  private static validateFormInput(input: HTMLInputElement): boolean {
    const value = input.value;
    const type = input.type;
    
    switch (type) {
      case 'email':
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
      case 'url':
        return XSSProtection.validateInput(value, 'url');
      case 'text':
      case 'textarea':
        return XSSProtection.validateInput(value, 'text');
      default:
        return true;
    }
  }
}

// Initialize security measures
export const initializeSecurity = (): void => {
  // Apply default CSP
  CSPManager.applyCSP();
  
  // Set up global error handling for security events
  window.addEventListener('error', (event) => {
    if (event.error && event.error.name === 'SecurityError') {
      logSecurityEvent(
        SecurityEventType.SUSPICIOUS_ACTIVITY,
        SecurityLevel.MEDIUM,
        {
          error: event.error.message,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno
        }
      );
    }
  });
  
  // Monitor for potential XSS in DOM mutations
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;
            if (element.tagName === 'SCRIPT' && !element.hasAttribute('nonce')) {
              logSecurityEvent(
                SecurityEventType.XSS_ATTEMPT,
                SecurityLevel.CRITICAL,
                {
                  reason: 'Unauthorized script injection detected',
                  innerHTML: element.innerHTML.substring(0, 200)
                }
              );
              element.remove();
            }
          }
        });
      }
    });
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
};