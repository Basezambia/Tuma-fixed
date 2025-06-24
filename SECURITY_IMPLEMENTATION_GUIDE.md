# TUMA Security Implementation Guide

This guide provides comprehensive instructions for implementing the security framework in the TUMA application.

## 🔒 Security Framework Overview

The TUMA security framework provides multiple layers of protection:

1. **Input Validation & Sanitization**
2. **Authentication & Authorization**
3. **XSS & CSRF Protection**
4. **Rate Limiting**
5. **Secure File Uploads**
6. **Environment Security**
7. **Security Monitoring & Logging**
8. **Blockchain Security**

## 📦 Installation

### 1. Install Security Dependencies

```bash
# Install main dependencies
npm install dompurify validator jose helmet express-rate-limit express-validator bcryptjs crypto-js uuid

# Install type definitions
npm install --save-dev @types/dompurify @types/validator @types/bcryptjs @types/crypto-js @types/uuid
```

### 2. Environment Configuration

Update your `.env` file with security-related variables:

```env
# Required Security Configuration
VITE_JWT_SECRET=your-super-secure-jwt-secret-at-least-32-chars-long!
VITE_ENVIRONMENT=development

# Optional Security Configuration
VITE_ENCRYPTION_KEY=your-encryption-key-for-sensitive-data
VITE_SECURITY_WEBHOOK_URL=https://your-monitoring-service.com/webhook

# Existing Configuration (ensure these are secure)
VITE_ARWEAVE_JWK=your-arweave-jwk
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

## 🚀 Quick Start

### 1. Initialize Security Framework

Add this to your main application entry point (`src/main.tsx` or `src/App.tsx`):

```typescript
import { initializeTumaSecurity } from './lib/security-init';

// Initialize security before rendering your app
async function initializeApp() {
  try {
    await initializeTumaSecurity({
      enableCSP: true,
      enableRateLimiting: true,
      enableSecurityMonitoring: true,
      enableXSSProtection: true,
      enableCSRFProtection: true,
      logLevel: 'medium'
    });
    
    console.log('Security framework initialized successfully');
  } catch (error) {
    console.error('Failed to initialize security:', error);
  }
}

initializeApp();
```

### 2. Replace Arweave Service

Replace the existing `arweave-service.ts` usage with the secure version:

```typescript
// Before
import { arweaveService } from './lib/arweave-service';

// After
import { secureArweaveService } from './lib/secure-arweave-service';

// Usage
const uploadFile = async (file: File, recipient: string, description?: string) => {
  try {
    const transactionId = await secureArweaveService.uploadFileSecurely({
      file,
      recipient,
      description,
      tags: { category: 'document' }
    });
    
    console.log('File uploaded securely:', transactionId);
    return transactionId;
  } catch (error) {
    console.error('Secure upload failed:', error);
    throw error;
  }
};
```

### 3. Add Input Validation

Use security utilities for input validation:

```typescript
import { 
  validateENSName, 
  validateWalletAddress, 
  validateFileUpload,
  sanitizeInput 
} from './lib/security-utils';

// Validate user inputs
const handleFormSubmit = (formData: FormData) => {
  const recipient = formData.get('recipient') as string;
  const description = formData.get('description') as string;
  
  // Validate recipient
  if (!validateWalletAddress(recipient) && !validateENSName(recipient)) {
    throw new Error('Invalid recipient address or ENS name');
  }
  
  // Sanitize description
  const sanitizedDescription = sanitizeInput(description);
  
  // Continue with processing...
};
```

### 4. Implement Rate Limiting

Add rate limiting to user actions:

```typescript
import { rateLimiters, getUserIdentifier } from './lib/rate-limiter';

const handleFileUpload = async (file: File) => {
  const userIdentifier = getUserIdentifier();
  
  // Check rate limit
  const rateLimitResult = await rateLimiters.upload.checkLimit(userIdentifier);
  
  if (!rateLimitResult.allowed) {
    const resetTime = new Date(rateLimitResult.resetTime);
    throw new Error(`Upload limit exceeded. Try again at ${resetTime.toLocaleTimeString()}`);
  }
  
  // Proceed with upload...
};
```

### 5. Add Security Monitoring

Log security events throughout your application:

```typescript
import { logSecurityEvent, SecurityEventType, SecurityLevel } from './lib/security-monitor';

// Log successful authentication
logSecurityEvent(
  SecurityEventType.AUTHENTICATION_SUCCESS,
  SecurityLevel.LOW,
  { walletAddress: userAddress, method: 'wallet_connect' }
);

// Log failed authentication
logSecurityEvent(
  SecurityEventType.AUTHENTICATION_FAILURE,
  SecurityLevel.MEDIUM,
  { attemptedAddress: address, reason: 'invalid_signature' }
);

// Log suspicious activity
logSecurityEvent(
  SecurityEventType.SUSPICIOUS_ACTIVITY,
  SecurityLevel.HIGH,
  { action: 'multiple_failed_uploads', userIdentifier }
);
```

## 🔧 Advanced Configuration

### Custom Security Configuration

```typescript
import { initializeTumaSecurity } from './lib/security-init';

await initializeTumaSecurity({
  enableCSP: true,
  enableRateLimiting: true,
  enableSecurityMonitoring: true,
  enableXSSProtection: true,
  enableCSRFProtection: true,
  logLevel: 'high', // 'low' | 'medium' | 'high' | 'critical'
  monitoringWebhook: 'https://your-monitoring-service.com/webhook'
});
```

### Custom Rate Limits

```typescript
import { RateLimiter } from './lib/rate-limiter';

// Create custom rate limiter
const customLimiter = RateLimiter.getInstance('custom', {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 5
});

// Use in your application
const result = await customLimiter.checkLimit(userIdentifier);
if (!result.allowed) {
  // Handle rate limit exceeded
}
```

### Enhanced Authentication

```typescript
import { authManager } from './lib/enhanced-auth';

// Create secure session
const sessionToken = await authManager.createSecureSession(
  walletAddress,
  'user' // or 'admin' | 'enterprise'
);

// Validate session
const session = await authManager.validateSession(sessionToken);
if (!session) {
  // Handle invalid session
}

// Revoke session
await authManager.revokeSession();
```

## 🛡️ Security Best Practices

### 1. Environment Variables

- Never commit sensitive keys to version control
- Use different keys for development and production
- Rotate keys regularly
- Use strong, randomly generated secrets

### 2. File Upload Security

```typescript
import { validateFileUpload } from './lib/security-utils';

const handleFileUpload = (file: File) => {
  // Always validate files before processing
  const validation = validateFileUpload(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }
  
  // Additional custom validation
  if (file.size > 50 * 1024 * 1024) { // 50MB limit
    throw new Error('File too large');
  }
};
```

### 3. Input Sanitization

```typescript
import { XSSProtection } from './lib/xss-csrf-protection';

// Always sanitize user inputs
const userInput = XSSProtection.sanitizeText(rawInput);
const htmlContent = XSSProtection.sanitizeHTML(rawHTML, ['p', 'br', 'strong']);

// Validate inputs based on context
if (!XSSProtection.validateInput(userUrl, 'url')) {
  throw new Error('Invalid URL');
}
```

### 4. Error Handling

```typescript
try {
  // Sensitive operation
} catch (error) {
  // Log security event
  logSecurityEvent(
    SecurityEventType.SUSPICIOUS_ACTIVITY,
    SecurityLevel.MEDIUM,
    { 
      action: 'operation_failed',
      error: error.message,
      userIdentifier: getUserIdentifier()
    }
  );
  
  // Don't expose sensitive error details to users
  throw new Error('Operation failed. Please try again.');
}
```

## 📊 Security Monitoring

### Health Check

```typescript
import { performSecurityHealthCheck } from './lib/security-init';

const healthCheck = performSecurityHealthCheck();
console.log('Security Status:', healthCheck.status);

if (healthCheck.issues.length > 0) {
  console.warn('Security Issues:', healthCheck.issues);
  console.log('Recommendations:', healthCheck.recommendations);
}
```

### Security Reports

```typescript
import { securityManager } from './lib/security-init';

// Get current security status
const status = securityManager.getSecurityStatus();

// Generate security report
const report = securityManager.generateSecurityReport();
console.log('Security Report:', report);
```

## 🚨 Incident Response

### 1. Critical Security Events

When critical events are detected:

1. **Immediate Actions:**
   - Review security logs
   - Identify affected users/data
   - Implement temporary mitigations

2. **Investigation:**
   - Analyze attack vectors
   - Assess damage scope
   - Document findings

3. **Recovery:**
   - Apply security patches
   - Reset compromised credentials
   - Notify affected users

### 2. Security Alert Management

```typescript
import { securityMonitor } from './lib/security-monitor';

// Get active alerts
const alerts = securityMonitor.getActiveAlerts();

// Acknowledge alert
securityMonitor.acknowledgeAlert(alertId, 'admin_user');

// Resolve security event
securityMonitor.resolveEvent(eventId, 'admin_user');
```

## 🔄 Maintenance

### Regular Security Tasks

1. **Weekly:**
   - Review security logs
   - Check for dependency updates
   - Monitor rate limit effectiveness

2. **Monthly:**
   - Rotate API keys
   - Review access permissions
   - Update security configurations

3. **Quarterly:**
   - Security audit
   - Penetration testing
   - Update security policies

### Security Updates

```bash
# Check for security vulnerabilities
npm audit

# Fix automatically fixable vulnerabilities
npm audit fix

# Update dependencies
npm update

# Check for outdated packages
npm outdated
```

## 📞 Support

For security-related questions or to report vulnerabilities:

1. **Internal Issues:** Create a GitHub issue with the `security` label
2. **Vulnerabilities:** Email security@tuma.app (if available)
3. **Emergency:** Follow your organization's incident response procedures

## 📚 Additional Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Web Security Guidelines](https://developer.mozilla.org/en-US/docs/Web/Security)
- [Arweave Security Best Practices](https://docs.arweave.org/developers/)
- [Supabase Security](https://supabase.com/docs/guides/auth/security)

---

**Remember:** Security is an ongoing process, not a one-time implementation. Regularly review and update your security measures as threats evolve.