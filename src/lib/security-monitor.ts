import { sanitizeForLogging } from './security-utils';

export enum SecurityEventType {
  AUTHENTICATION_SUCCESS = 'auth_success',
  AUTHENTICATION_FAILURE = 'auth_failure',
  AUTHORIZATION_FAILURE = 'authz_failure',
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  FILE_UPLOAD_BLOCKED = 'file_upload_blocked',
  XSS_ATTEMPT = 'xss_attempt',
  INJECTION_ATTEMPT = 'injection_attempt',
  SESSION_HIJACK_ATTEMPT = 'session_hijack_attempt',
  UNUSUAL_ACCESS_PATTERN = 'unusual_access_pattern',
  DATA_BREACH_ATTEMPT = 'data_breach_attempt',
  MALICIOUS_FILE_DETECTED = 'malicious_file_detected'
}

export enum SecurityLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

interface SecurityEvent {
  id: string;
  type: SecurityEventType;
  level: SecurityLevel;
  timestamp: number;
  userIdentifier?: string;
  ipAddress?: string;
  userAgent?: string;
  details: Record<string, any>;
  resolved: boolean;
  resolvedAt?: number;
  resolvedBy?: string;
}

interface SecurityAlert {
  id: string;
  events: SecurityEvent[];
  pattern: string;
  severity: SecurityLevel;
  createdAt: number;
  acknowledged: boolean;
}

export class SecurityMonitor {
  private static instance: SecurityMonitor;
  private events: SecurityEvent[] = [];
  private alerts: SecurityAlert[] = [];
  private maxEvents = 10000; // Keep last 10k events
  private alertThresholds: Map<SecurityEventType, { count: number; timeWindow: number }> = new Map();
  
  private constructor() {
    this.initializeAlertThresholds();
    this.startPeriodicAnalysis();
  }
  
  static getInstance(): SecurityMonitor {
    if (!SecurityMonitor.instance) {
      SecurityMonitor.instance = new SecurityMonitor();
    }
    return SecurityMonitor.instance;
  }
  
  logSecurityEvent(
    type: SecurityEventType,
    level: SecurityLevel,
    details: Record<string, any>,
    userIdentifier?: string
  ): void {
    const event: SecurityEvent = {
      id: crypto.randomUUID(),
      type,
      level,
      timestamp: Date.now(),
      userIdentifier,
      ipAddress: this.getClientIP(),
      userAgent: navigator.userAgent,
      details: sanitizeForLogging(details),
      resolved: false
    };
    
    this.events.push(event);
    
    // Maintain event limit
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }
    
    // Log to console based on severity
    this.logToConsole(event);
    
    // Check for alert patterns
    this.checkForAlerts(event);
    
    // Send to external monitoring if configured
    this.sendToExternalMonitoring(event);
  }
  
  getRecentEvents(timeWindow: number = 24 * 60 * 60 * 1000): SecurityEvent[] {
    const cutoff = Date.now() - timeWindow;
    return this.events.filter(event => event.timestamp > cutoff);
  }
  
  getEventsByType(type: SecurityEventType, timeWindow?: number): SecurityEvent[] {
    let events = this.events.filter(event => event.type === type);
    
    if (timeWindow) {
      const cutoff = Date.now() - timeWindow;
      events = events.filter(event => event.timestamp > cutoff);
    }
    
    return events;
  }
  
  getEventsByUser(userIdentifier: string, timeWindow?: number): SecurityEvent[] {
    let events = this.events.filter(event => event.userIdentifier === userIdentifier);
    
    if (timeWindow) {
      const cutoff = Date.now() - timeWindow;
      events = events.filter(event => event.timestamp > cutoff);
    }
    
    return events;
  }
  
  getActiveAlerts(): SecurityAlert[] {
    return this.alerts.filter(alert => !alert.acknowledged);
  }
  
  acknowledgeAlert(alertId: string, acknowledgedBy: string): void {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      console.log(`Security alert acknowledged: ${alertId} by ${acknowledgedBy}`);
    }
  }
  
  resolveEvent(eventId: string, resolvedBy: string): void {
    const event = this.events.find(e => e.id === eventId);
    if (event) {
      event.resolved = true;
      event.resolvedAt = Date.now();
      event.resolvedBy = resolvedBy;
    }
  }
  
  generateSecurityReport(timeWindow: number = 24 * 60 * 60 * 1000): any {
    const recentEvents = this.getRecentEvents(timeWindow);
    const eventsByType = new Map<SecurityEventType, number>();
    const eventsByLevel = new Map<SecurityLevel, number>();
    const topUsers = new Map<string, number>();
    
    recentEvents.forEach(event => {
      // Count by type
      eventsByType.set(event.type, (eventsByType.get(event.type) || 0) + 1);
      
      // Count by level
      eventsByLevel.set(event.level, (eventsByLevel.get(event.level) || 0) + 1);
      
      // Count by user
      if (event.userIdentifier) {
        topUsers.set(event.userIdentifier, (topUsers.get(event.userIdentifier) || 0) + 1);
      }
    });
    
    return {
      timeWindow,
      totalEvents: recentEvents.length,
      eventsByType: Object.fromEntries(eventsByType),
      eventsByLevel: Object.fromEntries(eventsByLevel),
      topUsers: Object.fromEntries(
        Array.from(topUsers.entries())
          .sort(([,a], [,b]) => b - a)
          .slice(0, 10)
      ),
      activeAlerts: this.getActiveAlerts().length,
      criticalEvents: recentEvents.filter(e => e.level === SecurityLevel.CRITICAL).length
    };
  }
  
  private initializeAlertThresholds(): void {
    // Define thresholds for different event types
    this.alertThresholds.set(SecurityEventType.AUTHENTICATION_FAILURE, {
      count: 5,
      timeWindow: 15 * 60 * 1000 // 15 minutes
    });
    
    this.alertThresholds.set(SecurityEventType.RATE_LIMIT_EXCEEDED, {
      count: 3,
      timeWindow: 5 * 60 * 1000 // 5 minutes
    });
    
    this.alertThresholds.set(SecurityEventType.SUSPICIOUS_ACTIVITY, {
      count: 2,
      timeWindow: 10 * 60 * 1000 // 10 minutes
    });
    
    this.alertThresholds.set(SecurityEventType.XSS_ATTEMPT, {
      count: 1,
      timeWindow: 60 * 1000 // 1 minute
    });
    
    this.alertThresholds.set(SecurityEventType.INJECTION_ATTEMPT, {
      count: 1,
      timeWindow: 60 * 1000 // 1 minute
    });
  }
  
  private checkForAlerts(event: SecurityEvent): void {
    const threshold = this.alertThresholds.get(event.type);
    if (!threshold) return;
    
    const recentEvents = this.getEventsByType(event.type, threshold.timeWindow);
    
    if (recentEvents.length >= threshold.count) {
      this.createAlert(event.type, recentEvents);
    }
  }
  
  private createAlert(eventType: SecurityEventType, events: SecurityEvent[]): void {
    const alert: SecurityAlert = {
      id: crypto.randomUUID(),
      events,
      pattern: `Multiple ${eventType} events detected`,
      severity: this.getAlertSeverity(eventType, events.length),
      createdAt: Date.now(),
      acknowledged: false
    };
    
    this.alerts.push(alert);
    
    console.warn('Security alert created:', {
      id: alert.id,
      pattern: alert.pattern,
      severity: alert.severity,
      eventCount: events.length
    });
    
    // Trigger immediate notification for critical alerts
    if (alert.severity === SecurityLevel.CRITICAL) {
      this.triggerCriticalAlert(alert);
    }
  }
  
  private getAlertSeverity(eventType: SecurityEventType, eventCount: number): SecurityLevel {
    const criticalEvents = [
      SecurityEventType.DATA_BREACH_ATTEMPT,
      SecurityEventType.SESSION_HIJACK_ATTEMPT,
      SecurityEventType.MALICIOUS_FILE_DETECTED
    ];
    
    if (criticalEvents.includes(eventType)) {
      return SecurityLevel.CRITICAL;
    }
    
    if (eventCount >= 10) return SecurityLevel.HIGH;
    if (eventCount >= 5) return SecurityLevel.MEDIUM;
    return SecurityLevel.LOW;
  }
  
  private triggerCriticalAlert(alert: SecurityAlert): void {
    // In a real implementation, this would send notifications
    // via email, SMS, Slack, etc.
    console.error('CRITICAL SECURITY ALERT:', alert);
    
    // Could also trigger automatic responses like:
    // - Temporarily blocking suspicious IPs
    // - Forcing password resets
    // - Disabling affected accounts
  }
  
  private logToConsole(event: SecurityEvent): void {
    const logData = {
      type: event.type,
      level: event.level,
      timestamp: new Date(event.timestamp).toISOString(),
      user: event.userIdentifier,
      details: event.details
    };
    
    switch (event.level) {
      case SecurityLevel.CRITICAL:
        console.error('CRITICAL SECURITY EVENT:', logData);
        break;
      case SecurityLevel.HIGH:
        console.error('HIGH SECURITY EVENT:', logData);
        break;
      case SecurityLevel.MEDIUM:
        console.warn('MEDIUM SECURITY EVENT:', logData);
        break;
      case SecurityLevel.LOW:
        console.info('LOW SECURITY EVENT:', logData);
        break;
    }
  }
  
  private sendToExternalMonitoring(event: SecurityEvent): void {
    // In a real implementation, send to external services like:
    // - Datadog
    // - New Relic
    // - Splunk
    // - Custom SIEM
    
    if (import.meta.env.VITE_SECURITY_WEBHOOK_URL) {
      fetch(import.meta.env.VITE_SECURITY_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(event)
      }).catch(error => {
        console.error('Failed to send security event to external monitoring:', error);
      });
    }
  }
  
  private startPeriodicAnalysis(): void {
    // Run analysis every 5 minutes
    setInterval(() => {
      this.analyzePatterns();
    }, 5 * 60 * 1000);
  }
  
  private analyzePatterns(): void {
    // Look for unusual patterns in the last hour
    const recentEvents = this.getRecentEvents(60 * 60 * 1000);
    
    // Check for unusual access patterns
    this.detectUnusualAccessPatterns(recentEvents);
    
    // Check for potential coordinated attacks
    this.detectCoordinatedAttacks(recentEvents);
  }
  
  private detectUnusualAccessPatterns(events: SecurityEvent[]): void {
    const userActivity = new Map<string, SecurityEvent[]>();
    
    events.forEach(event => {
      if (event.userIdentifier) {
        if (!userActivity.has(event.userIdentifier)) {
          userActivity.set(event.userIdentifier, []);
        }
        userActivity.get(event.userIdentifier)!.push(event);
      }
    });
    
    userActivity.forEach((userEvents, userId) => {
      // Check for rapid successive actions
      if (userEvents.length > 50) { // More than 50 actions in an hour
        this.logSecurityEvent(
          SecurityEventType.UNUSUAL_ACCESS_PATTERN,
          SecurityLevel.MEDIUM,
          {
            userId,
            eventCount: userEvents.length,
            pattern: 'high_frequency_access'
          },
          userId
        );
      }
    });
  }
  
  private detectCoordinatedAttacks(events: SecurityEvent[]): void {
    // Group events by IP address (if available)
    const ipActivity = new Map<string, SecurityEvent[]>();
    
    events.forEach(event => {
      if (event.ipAddress) {
        if (!ipActivity.has(event.ipAddress)) {
          ipActivity.set(event.ipAddress, []);
        }
        ipActivity.get(event.ipAddress)!.push(event);
      }
    });
    
    // Look for multiple failed attempts from same IP
    ipActivity.forEach((ipEvents, ip) => {
      const failedAttempts = ipEvents.filter(event => 
        event.type === SecurityEventType.AUTHENTICATION_FAILURE ||
        event.type === SecurityEventType.AUTHORIZATION_FAILURE
      );
      
      if (failedAttempts.length > 10) {
        this.logSecurityEvent(
          SecurityEventType.SUSPICIOUS_ACTIVITY,
          SecurityLevel.HIGH,
          {
            ipAddress: ip,
            failedAttempts: failedAttempts.length,
            pattern: 'coordinated_attack_attempt'
          }
        );
      }
    });
  }
  
  private getClientIP(): string {
    // In a browser environment, we can't directly get the real IP
    // This would typically be handled server-side
    return 'client-side-unknown';
  }
}

// Export singleton instance
export const securityMonitor = SecurityMonitor.getInstance();

// Convenience functions
export const logSecurityEvent = (
  type: SecurityEventType,
  level: SecurityLevel,
  details: Record<string, any>,
  userIdentifier?: string
) => {
  securityMonitor.logSecurityEvent(type, level, details, userIdentifier);
};