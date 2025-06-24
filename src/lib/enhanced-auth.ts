import { supabase } from './supabase-auth';
import { SignJWT, jwtVerify } from 'jose';
import { sanitizeForLogging } from './security-utils';

interface UserSession {
  walletAddress: string;
  role: 'user' | 'admin' | 'enterprise';
  permissions: string[];
  sessionId: string;
  expiresAt: number;
  createdAt: number;
}

interface SessionConfig {
  maxAge: number; // in milliseconds
  renewThreshold: number; // renew if less than this time remaining
  maxSessions: number; // max concurrent sessions per user
}

export class SecureAuthManager {
  private static instance: SecureAuthManager;
  private sessionKey: Uint8Array;
  private activeSessions: Map<string, UserSession> = new Map();
  private config: SessionConfig = {
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    renewThreshold: 2 * 60 * 60 * 1000, // 2 hours
    maxSessions: 3
  };
  
  private constructor() {
    const secret = import.meta.env.VITE_JWT_SECRET || 'default-secret-change-in-production';
    this.sessionKey = new TextEncoder().encode(secret);
    this.initializeSessionCleanup();
  }
  
  static getInstance(): SecureAuthManager {
    if (!SecureAuthManager.instance) {
      SecureAuthManager.instance = new SecureAuthManager();
    }
    return SecureAuthManager.instance;
  }
  
  async createSecureSession(walletAddress: string, role: 'user' | 'admin' | 'enterprise' = 'user'): Promise<string> {
    try {
      // Clean up expired sessions
      this.cleanupExpiredSessions();
      
      // Check session limit
      const userSessions = Array.from(this.activeSessions.values())
        .filter(session => session.walletAddress === walletAddress);
      
      if (userSessions.length >= this.config.maxSessions) {
        // Remove oldest session
        const oldestSession = userSessions.sort((a, b) => a.createdAt - b.createdAt)[0];
        this.activeSessions.delete(oldestSession.sessionId);
      }
      
      const sessionId = crypto.randomUUID();
      const now = Date.now();
      const expiresAt = now + this.config.maxAge;
      
      const sessionData: UserSession = {
        walletAddress,
        role,
        permissions: this.getPermissionsForRole(role),
        sessionId,
        expiresAt,
        createdAt: now
      };
      
      const token = await new SignJWT({
        walletAddress,
        sessionId,
        expiresAt,
        role,
        permissions: sessionData.permissions
      })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime(new Date(expiresAt))
      .setIssuedAt()
      .setSubject(walletAddress)
      .sign(this.sessionKey);
      
      // Store session
      this.activeSessions.set(sessionId, sessionData);
      
      // Store in secure storage
      this.storeSessionSecurely(token);
      
      console.log('Secure session created', sanitizeForLogging({ sessionId, walletAddress, role }));
      
      return token;
    } catch (error) {
      console.error('Failed to create secure session:', error);
      throw new Error('Session creation failed');
    }
  }
  
  async validateSession(token?: string): Promise<UserSession | null> {
    try {
      const sessionToken = token || this.getStoredSession();
      if (!sessionToken) return null;
      
      const { payload } = await jwtVerify(sessionToken, this.sessionKey);
      const sessionId = payload.sessionId as string;
      
      // Check if session exists in memory
      const session = this.activeSessions.get(sessionId);
      if (!session) return null;
      
      // Check expiration
      if (Date.now() > session.expiresAt) {
        this.revokeSession(sessionId);
        return null;
      }
      
      // Auto-renew if close to expiration
      if (session.expiresAt - Date.now() < this.config.renewThreshold) {
        await this.renewSession(sessionId);
      }
      
      return session;
    } catch (error) {
      console.error('Session validation failed:', error);
      return null;
    }
  }
  
  async renewSession(sessionId: string): Promise<string | null> {
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session) return null;
      
      // Create new session with extended expiration
      const newToken = await this.createSecureSession(session.walletAddress, session.role);
      
      // Revoke old session
      this.activeSessions.delete(sessionId);
      
      return newToken;
    } catch (error) {
      console.error('Session renewal failed:', error);
      return null;
    }
  }
  
  async revokeSession(sessionId?: string): Promise<void> {
    try {
      if (sessionId) {
        this.activeSessions.delete(sessionId);
      } else {
        // Revoke current session
        const token = this.getStoredSession();
        if (token) {
          const { payload } = await jwtVerify(token, this.sessionKey);
          this.activeSessions.delete(payload.sessionId as string);
        }
      }
      
      // Clear stored session
      this.clearStoredSession();
      
      console.log('Session revoked', sanitizeForLogging({ sessionId }));
    } catch (error) {
      console.error('Session revocation failed:', error);
    }
  }
  
  async revokeAllSessions(walletAddress: string): Promise<void> {
    try {
      const userSessions = Array.from(this.activeSessions.entries())
        .filter(([_, session]) => session.walletAddress === walletAddress);
      
      userSessions.forEach(([sessionId]) => {
        this.activeSessions.delete(sessionId);
      });
      
      this.clearStoredSession();
      
      console.log('All sessions revoked for user', sanitizeForLogging({ walletAddress }));
    } catch (error) {
      console.error('Failed to revoke all sessions:', error);
    }
  }
  
  getActiveSessions(walletAddress: string): UserSession[] {
    return Array.from(this.activeSessions.values())
      .filter(session => session.walletAddress === walletAddress);
  }
  
  private getPermissionsForRole(role: string): string[] {
    const permissions: Record<string, string[]> = {
      user: ['read:files', 'write:files', 'delete:own_files'],
      admin: ['read:files', 'write:files', 'delete:files', 'manage:users'],
      enterprise: ['read:files', 'write:files', 'delete:files', 'manage:organization']
    };
    
    return permissions[role] || permissions.user;
  }
  
  private storeSessionSecurely(token: string): void {
    // Use sessionStorage for better security (cleared on tab close)
    sessionStorage.setItem('tuma_session', token);
    
    // Set secure cookie as backup (httpOnly would be set server-side)
    const expires = new Date(Date.now() + this.config.maxAge).toUTCString();
    document.cookie = `tuma_session_backup=${token}; Secure; SameSite=Strict; expires=${expires}; path=/`;
  }
  
  private getStoredSession(): string | null {
    return sessionStorage.getItem('tuma_session') || this.getCookieValue('tuma_session_backup');
  }
  
  private clearStoredSession(): void {
    sessionStorage.removeItem('tuma_session');
    document.cookie = 'tuma_session_backup=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; Secure; SameSite=Strict';
  }
  
  private getCookieValue(name: string): string | null {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) {
      return parts.pop()?.split(';').shift() || null;
    }
    return null;
  }
  
  private cleanupExpiredSessions(): void {
    const now = Date.now();
    for (const [sessionId, session] of this.activeSessions.entries()) {
      if (now > session.expiresAt) {
        this.activeSessions.delete(sessionId);
      }
    }
  }
  
  private initializeSessionCleanup(): void {
    // Clean up expired sessions every 5 minutes
    setInterval(() => {
      this.cleanupExpiredSessions();
    }, 5 * 60 * 1000);
  }
}

// Export singleton instance
export const authManager = SecureAuthManager.getInstance();