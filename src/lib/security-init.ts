import { initializeSecurity } from './xss-csrf-protection';
import { secureConfig } from './secure-config';
import { securityMonitor, logSecurityEvent, SecurityEventType, SecurityLevel } from './security-monitor';
import { authManager } from './enhanced-auth';
import { rateLimiters } from './rate-limiter';

// Security configuration interface
interface SecurityConfig {
  enableCSP: boolean;
  enableRateLimiting: boolean;
  enableSecurityMonitoring: boolean;
  enableXSSProtection: boolean;
  enableCSRFProtection: boolean;
  logLevel: 'low' | 'medium' | 'high' | 'critical';
  monitoringWebhook?: string;
}

// Default security configuration
const defaultSecurityConfig: SecurityConfig = {
  enableCSP: true,
  enableRateLimiting: true,
  enableSecurityMonitoring: true,
  enableXSSProtection: true,
  enableCSRFProtection: true,
  logLevel: 'medium'
};

export class SecurityManager {
  private static instance: SecurityManager;
  private config: SecurityConfig;
  private initialized = false;
  
  private constructor(config: Partial<SecurityConfig> = {}) {
    this.config = { ...defaultSecurityConfig, ...config };
  }
  
  static getInstance(config?: Partial<SecurityConfig>): SecurityManager {
    if (!SecurityManager.instance) {
      SecurityManager.instance = new SecurityManager(config);
    }
    return SecurityManager.instance;
  }
  
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.warn('Security manager already initialized');
      return;
    }
    
    try {
      console.log('Initializing TUMA Security Framework...');
      
      // Initialize secure configuration
      await this.initializeSecureConfig();
      
      // Initialize XSS and CSRF protection
      if (this.config.enableXSSProtection || this.config.enableCSRFProtection) {
        initializeSecurity();
        console.log('✓ XSS and CSRF protection enabled');
      }
      
      // Initialize security monitoring
      if (this.config.enableSecurityMonitoring) {
        this.initializeSecurityMonitoring();
        console.log('✓ Security monitoring enabled');
      }
      
      // Initialize rate limiting
      if (this.config.enableRateLimiting) {
        this.initializeRateLimiting();
        console.log('✓ Rate limiting enabled');
      }
      
      // Initialize authentication manager
      await this.initializeAuthManager();
      console.log('✓ Enhanced authentication enabled');
      
      // Set up global error handlers
      this.setupGlobalErrorHandlers();
      
      // Set up security headers
      this.setupSecurityHeaders();
      
      // Log successful initialization
      logSecurityEvent(
        SecurityEventType.AUTHENTICATION_SUCCESS,
        SecurityLevel.LOW,
        {
          action: 'Security framework initialized',
          config: this.getSafeConfig(),
          timestamp: Date.now()
        }
      );
      
      this.initialized = true;
      console.log('🔒 TUMA Security Framework initialized successfully');
      
    } catch (error) {
      console.error('Failed to initialize security framework:', error);
      
      logSecurityEvent(
        SecurityEventType.AUTHENTICATION_FAILURE,
        SecurityLevel.CRITICAL,
        {
          action: 'Security framework initialization failed',
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: Date.now()
        }
      );
      
      throw new Error('Security initialization failed');
    }
  }
  
  private async initializeSecureConfig(): Promise<void> {
    try {
      // Validate that all required configuration is present
      const requiredKeys = [
        'VITE_SUPABASE_URL',
        'VITE_SUPABASE_ANON_KEY',
        'VITE_ARWEAVE_JWK'
      ];
      
      const missingKeys = requiredKeys.filter(key => !secureConfig.has(key));
      
      if (missingKeys.length > 0) {
        throw new Error(`Missing required configuration: ${missingKeys.join(', ')}`);
      }
      
      // Set monitoring webhook if provided
      if (this.config.monitoringWebhook) {
        secureConfig.set('VITE_SECURITY_WEBHOOK_URL', this.config.monitoringWebhook);
      }
      
    } catch (error) {
      throw new Error(`Configuration validation failed: ${error}`);
    }
  }
  
  private initializeSecurityMonitoring(): void {
    // Set up periodic security reports
    setInterval(() => {
      const report = securityMonitor.generateSecurityReport();
      
      if (report.criticalEvents > 0 || report.activeAlerts > 0) {
        console.warn('Security Report:', report);
        
        logSecurityEvent(
          SecurityEventType.UNUSUAL_ACCESS_PATTERN,
          SecurityLevel.HIGH,
          {
            action: 'Periodic security report',
            report,
            timestamp: Date.now()
          }
        );
      }
    }, 60 * 60 * 1000); // Every hour
  }
  
  private initializeRateLimiting(): void {
    // Rate limiters are already initialized in the rate-limiter module
    // This method can be used for additional configuration if needed
    console.log('Rate limiting configured:', {
      api: '100 requests per 15 minutes',
      upload: '10 uploads per hour',
      auth: '5 attempts per 15 minutes',
      search: '20 requests per minute',
      transaction: '3 transactions per 5 minutes'
    });
  }
  
  private async initializeAuthManager(): Promise<void> {
    // Auth manager is already initialized as a singleton
    // This method can be used for additional configuration if needed
  }
  
  private setupGlobalErrorHandlers(): void {
    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      logSecurityEvent(
        SecurityEventType.SUSPICIOUS_ACTIVITY,
        SecurityLevel.MEDIUM,
        {
          action: 'Unhandled promise rejection',
          reason: event.reason?.toString() || 'Unknown',
          timestamp: Date.now()
        }
      );
    });
    
    // Handle global errors
    window.addEventListener('error', (event) => {
      if (event.error?.name === 'SecurityError') {
        logSecurityEvent(
          SecurityEventType.SUSPICIOUS_ACTIVITY,
          SecurityLevel.HIGH,
          {
            action: 'Security error detected',
            message: event.error.message,
            filename: event.filename,
            lineno: event.lineno,
            timestamp: Date.now()
          }
        );
      }
    });
    
    // Monitor for suspicious DOM modifications
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element;
              
              // Check for suspicious script injections
              if (element.tagName === 'SCRIPT' && !element.hasAttribute('nonce')) {
                logSecurityEvent(
                  SecurityEventType.XSS_ATTEMPT,
                  SecurityLevel.CRITICAL,
                  {
                    action: 'Unauthorized script injection detected',
                    innerHTML: element.innerHTML.substring(0, 200),
                    timestamp: Date.now()
                  }
                );
                element.remove();
              }
              
              // Check for suspicious iframe injections
              if (element.tagName === 'IFRAME') {
                const src = element.getAttribute('src');
                if (src && !src.startsWith('https://')) {
                  logSecurityEvent(
                    SecurityEventType.XSS_ATTEMPT,
                    SecurityLevel.HIGH,
                    {
                      action: 'Suspicious iframe injection detected',
                      src,
                      timestamp: Date.now()
                    }
                  );
                  element.remove();
                }
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
  }
  
  private setupSecurityHeaders(): void {
    // Add security headers via meta tags (limited effectiveness in SPA)
    const headers = secureConfig.getSecureHeaders();
    
    Object.entries(headers).forEach(([name, value]) => {
      const meta = document.createElement('meta');
      meta.httpEquiv = name;
      meta.content = value;
      document.head.appendChild(meta);
    });
  }
  
  getSecurityStatus(): any {
    return {
      initialized: this.initialized,
      config: this.getSafeConfig(),
      recentEvents: securityMonitor.getRecentEvents(60 * 60 * 1000), // Last hour
      activeAlerts: securityMonitor.getActiveAlerts(),
      rateLimitStatus: {
        api: rateLimiters.api,
        upload: rateLimiters.upload,
        auth: rateLimiters.auth,
        search: rateLimiters.search,
        transaction: rateLimiters.transaction
      }
    };
  }
  
  generateSecurityReport(): any {
    return securityMonitor.generateSecurityReport();
  }
  
  private getSafeConfig(): any {
    return {
      enableCSP: this.config.enableCSP,
      enableRateLimiting: this.config.enableRateLimiting,
      enableSecurityMonitoring: this.config.enableSecurityMonitoring,
      enableXSSProtection: this.config.enableXSSProtection,
      enableCSRFProtection: this.config.enableCSRFProtection,
      logLevel: this.config.logLevel,
      environment: secureConfig.get('VITE_ENVIRONMENT')
    };
  }
}

// Convenience function to initialize security with default settings
export const initializeTumaSecurity = async (config?: Partial<SecurityConfig>): Promise<void> => {
  const securityManager = SecurityManager.getInstance(config);
  await securityManager.initialize();
};

// Export security manager instance
export const securityManager = SecurityManager.getInstance();

// Security health check function
export const performSecurityHealthCheck = (): {
  status: 'healthy' | 'warning' | 'critical';
  issues: string[];
  recommendations: string[];
} => {
  const issues: string[] = [];
  const recommendations: string[] = [];
  
  // Check if security is initialized
  if (!securityManager.getSecurityStatus().initialized) {
    issues.push('Security framework not initialized');
    recommendations.push('Call initializeTumaSecurity() before using the application');
  }
  
  // Check for recent critical events
  const recentEvents = securityMonitor.getRecentEvents(60 * 60 * 1000);
  const criticalEvents = recentEvents.filter(event => event.level === SecurityLevel.CRITICAL);
  
  if (criticalEvents.length > 0) {
    issues.push(`${criticalEvents.length} critical security events in the last hour`);
    recommendations.push('Review security logs and investigate critical events');
  }
  
  // Check for active alerts
  const activeAlerts = securityMonitor.getActiveAlerts();
  if (activeAlerts.length > 0) {
    issues.push(`${activeAlerts.length} unacknowledged security alerts`);
    recommendations.push('Review and acknowledge security alerts');
  }
  
  // Check environment configuration
  if (!secureConfig.isProduction() && secureConfig.get('VITE_ENVIRONMENT') !== 'development') {
    issues.push('Environment not properly configured');
    recommendations.push('Set VITE_ENVIRONMENT to either "development" or "production"');
  }
  
  // Determine overall status
  let status: 'healthy' | 'warning' | 'critical' = 'healthy';
  
  if (criticalEvents.length > 0 || !securityManager.getSecurityStatus().initialized) {
    status = 'critical';
  } else if (issues.length > 0) {
    status = 'warning';
  }
  
  return {
    status,
    issues,
    recommendations
  };
};