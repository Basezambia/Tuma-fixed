// Analytics Service for Real-Time Monitoring and Reporting
import { supabase } from './supabase-auth';
import {
  AnalyticsEvent,
  DashboardMetrics,
  UserAnalytics,
  OrganizationAnalytics,
  ApiUsageMetrics,
  ApiResponse,
} from '../types/enterprise';

interface TimeSeriesData {
  date: string;
  value: number;
  label?: string;
}

interface CustomReportConfig {
  metrics: string[];
  filters: Record<string, any>;
  groupBy: string;
  timeRange: {
    start: string;
    end: string;
  };
  aggregation: 'sum' | 'avg' | 'count' | 'max' | 'min';
}

interface AlertConfig {
  id: string;
  name: string;
  metric: string;
  condition: 'greater_than' | 'less_than' | 'equals';
  threshold: number;
  enabled: boolean;
  notification_channels: string[];
}

class AnalyticsService {
  private static instance: AnalyticsService;
  private eventQueue: AnalyticsEvent[] = [];
  private flushInterval: NodeJS.Timeout | null = null;

  public static getInstance(): AnalyticsService {
    if (!AnalyticsService.instance) {
      AnalyticsService.instance = new AnalyticsService();
    }
    return AnalyticsService.instance;
  }

  constructor() {
    this.startEventFlushing();
  }

  // Event Tracking
  async track(eventType: string, properties: Record<string, any> = {}, userId?: string): Promise<void> {
    const event: AnalyticsEvent = {
      id: crypto.randomUUID(),
      user_id: userId,
      organization_id: properties.organization_id,
      event_type: eventType,
      event_data: {
        ...properties,
        timestamp: Date.now(),
        user_agent: navigator.userAgent,
        url: window.location.href,
        referrer: document.referrer,
      },
      created_at: new Date().toISOString(),
    };

    // Add to queue for batch processing
    this.eventQueue.push(event);

    // For critical events, flush immediately
    if (this.isCriticalEvent(eventType)) {
      await this.flushEvents();
    }
  }

  private isCriticalEvent(eventType: string): boolean {
    const criticalEvents = [
      'payment_completed',
      'file_upload_failed',
      'security_violation',
      'system_error',
    ];
    return criticalEvents.includes(eventType);
  }

  private startEventFlushing(): void {
    // Flush events every 30 seconds
    this.flushInterval = setInterval(() => {
      this.flushEvents();
    }, 30000);
  }

  private async flushEvents(): Promise<void> {
    if (this.eventQueue.length === 0) return;

    const eventsToFlush = [...this.eventQueue];
    this.eventQueue = [];

    try {
      const { error } = await supabase
        .from('analytics_events')
        .insert(eventsToFlush);

      if (error) {
        console.error('Failed to flush analytics events:', error);
        // Re-add events to queue for retry
        this.eventQueue.unshift(...eventsToFlush);
      }
    } catch (error) {
      console.error('Analytics flush error:', error);
      this.eventQueue.unshift(...eventsToFlush);
    }
  }

  // Real-Time Metrics
  async getRealTimeMetrics(organizationId?: string): Promise<ApiResponse<DashboardMetrics>> {
    try {
      const now = new Date();
      const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Build base queries
      const baseFileQuery = supabase.from('file_uploads').select('*');
      const baseEventQuery = supabase.from('analytics_events').select('*');

      const fileQuery = organizationId
        ? baseFileQuery.eq('organization_id', organizationId)
        : baseFileQuery;
      
      const eventQuery = organizationId
        ? baseEventQuery.eq('organization_id', organizationId)
        : baseEventQuery;

      // Get file data
      const { data: allFiles } = await fileQuery;
      const { data: recentFiles } = await fileQuery.gte('created_at', last24Hours.toISOString());
      
      // Get user activity
      const { data: userEvents } = await eventQuery
        .gte('created_at', last24Hours.toISOString())
        .eq('event_type', 'user_login');

      const { data: newUserEvents } = await eventQuery
        .gte('created_at', last7Days.toISOString())
        .eq('event_type', 'user_signup');

      // Calculate metrics
      const totalFiles = allFiles?.length || 0;
      const totalStorage = allFiles?.reduce((sum, file) => sum + file.file_size, 0) || 0;
      const totalRevenue = allFiles?.reduce((sum, file) => sum + file.upload_cost, 0) || 0;
      const averageFileSize = totalFiles > 0 ? totalStorage / totalFiles : 0;

      const activeUsers = new Set(userEvents?.map(e => e.user_id)).size;
      const newUsers = new Set(newUserEvents?.map(e => e.user_id)).size;
      const totalUsers = await this.getTotalUserCount(organizationId);

      // File type breakdown
      const fileTypeStats = this.calculateFileTypeStats(allFiles || []);

      // Time series data
      const userGrowth = await this.getUserGrowthData(organizationId, last30Days);
      const revenueGrowth = await this.getRevenueGrowthData(organizationId, last30Days);
      const storageUsage = await this.getStorageUsageData(organizationId, last30Days);

      const metrics: DashboardMetrics = {
        totalUsers,
        activeUsers,
        newUsers,
        totalFiles,
        totalStorage,
        totalRevenue,
        averageFileSize,
        topFileTypes: fileTypeStats,
        userGrowth,
        revenueGrowth,
        storageUsage,
      };

      return { success: true, data: metrics };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  private async getTotalUserCount(organizationId?: string): Promise<number> {
    try {
      if (organizationId) {
        const { count } = await supabase
          .from('user_organizations')
          .select('user_id', { count: 'exact' })
          .eq('organization_id', organizationId)
          .eq('is_active', true);
        return count || 0;
      } else {
        const { count } = await supabase
          .from('analytics_events')
          .select('user_id', { count: 'exact' })
          .not('user_id', 'is', null);
        return count || 0;
      }
    } catch {
      return 0;
    }
  }

  private calculateFileTypeStats(files: any[]): Array<{ type: string; count: number; percentage: number }> {
    const typeCount = files.reduce((acc, file) => {
      const type = file.file_type || 'unknown';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const total = files.length;
    return Object.entries(typeCount)
      .map(([type, count]) => ({
        type,
        count,
        percentage: total > 0 ? (count / total) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  private async getUserGrowthData(organizationId?: string, since: Date): Promise<TimeSeriesData[]> {
    try {
      const query = organizationId
        ? supabase.from('user_organizations')
            .select('joined_at')
            .eq('organization_id', organizationId)
            .gte('joined_at', since.toISOString())
        : supabase.from('analytics_events')
            .select('created_at')
            .eq('event_type', 'user_signup')
            .gte('created_at', since.toISOString());

      const { data } = await query;
      return this.groupByDay(data || [], organizationId ? 'joined_at' : 'created_at');
    } catch {
      return [];
    }
  }

  private async getRevenueGrowthData(organizationId?: string, since: Date): Promise<TimeSeriesData[]> {
    try {
      const query = supabase.from('file_uploads')
        .select('created_at, upload_cost')
        .gte('created_at', since.toISOString());

      const finalQuery = organizationId
        ? query.eq('organization_id', organizationId)
        : query;

      const { data } = await finalQuery;
      return this.groupByDay(data || [], 'created_at', 'upload_cost');
    } catch {
      return [];
    }
  }

  private async getStorageUsageData(organizationId?: string, since: Date): Promise<TimeSeriesData[]> {
    try {
      const query = supabase.from('file_uploads')
        .select('created_at, file_size')
        .gte('created_at', since.toISOString());

      const finalQuery = organizationId
        ? query.eq('organization_id', organizationId)
        : query;

      const { data } = await finalQuery;
      return this.groupByDay(data || [], 'created_at', 'file_size');
    } catch {
      return [];
    }
  }

  private groupByDay(data: any[], dateField: string, valueField?: string): TimeSeriesData[] {
    const grouped = data.reduce((acc, item) => {
      const date = new Date(item[dateField]).toISOString().split('T')[0];
      if (!acc[date]) {
        acc[date] = { count: 0, sum: 0 };
      }
      acc[date].count += 1;
      if (valueField && item[valueField]) {
        acc[date].sum += item[valueField];
      }
      return acc;
    }, {} as Record<string, { count: number; sum: number }>);

    return Object.entries(grouped)
      .map(([date, stats]) => ({
        date,
        value: valueField ? stats.sum : stats.count,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  // Custom Reports
  async generateCustomReport(config: CustomReportConfig): Promise<ApiResponse<any[]>> {
    try {
      let query = supabase.from('analytics_events').select('*');

      // Apply filters
      Object.entries(config.filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          query = query.eq(key, value);
        }
      });

      // Apply time range
      query = query
        .gte('created_at', config.timeRange.start)
        .lte('created_at', config.timeRange.end);

      const { data, error } = await query;
      if (error) throw error;

      // Process data based on groupBy and aggregation
      const processedData = this.processReportData(data || [], config);

      return { success: true, data: processedData };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  private processReportData(data: any[], config: CustomReportConfig): any[] {
    const grouped = data.reduce((acc, item) => {
      const groupKey = this.getGroupKey(item, config.groupBy);
      if (!acc[groupKey]) {
        acc[groupKey] = [];
      }
      acc[groupKey].push(item);
      return acc;
    }, {} as Record<string, any[]>);

    return Object.entries(grouped).map(([key, items]) => {
      const result: any = { [config.groupBy]: key };
      
      config.metrics.forEach(metric => {
        const values = items.map(item => this.extractMetricValue(item, metric)).filter(v => v !== null);
        result[metric] = this.applyAggregation(values, config.aggregation);
      });

      return result;
    });
  }

  private getGroupKey(item: any, groupBy: string): string {
    if (groupBy === 'date') {
      return new Date(item.created_at).toISOString().split('T')[0];
    }
    if (groupBy === 'hour') {
      return new Date(item.created_at).toISOString().slice(0, 13);
    }
    return item[groupBy] || 'unknown';
  }

  private extractMetricValue(item: any, metric: string): number | null {
    if (metric === 'count') return 1;
    if (item.event_data && typeof item.event_data[metric] === 'number') {
      return item.event_data[metric];
    }
    if (typeof item[metric] === 'number') {
      return item[metric];
    }
    return null;
  }

  private applyAggregation(values: number[], aggregation: string): number {
    if (values.length === 0) return 0;
    
    switch (aggregation) {
      case 'sum':
        return values.reduce((sum, val) => sum + val, 0);
      case 'avg':
        return values.reduce((sum, val) => sum + val, 0) / values.length;
      case 'count':
        return values.length;
      case 'max':
        return Math.max(...values);
      case 'min':
        return Math.min(...values);
      default:
        return values.reduce((sum, val) => sum + val, 0);
    }
  }

  // Performance Monitoring
  async trackPerformance(metric: string, value: number, tags: Record<string, string> = {}): Promise<void> {
    await this.track('performance_metric', {
      metric,
      value,
      tags,
    });
  }

  async getPerformanceMetrics(timeRange: { start: string; end: string }): Promise<ApiResponse<any[]>> {
    try {
      const { data, error } = await supabase
        .from('analytics_events')
        .select('*')
        .eq('event_type', 'performance_metric')
        .gte('created_at', timeRange.start)
        .lte('created_at', timeRange.end)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return { success: true, data: data || [] };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  // Error Tracking
  async trackError(error: Error, context: Record<string, any> = {}): Promise<void> {
    await this.track('error', {
      error_message: error.message,
      error_stack: error.stack,
      error_name: error.name,
      context,
    });
  }

  async getErrorMetrics(timeRange: { start: string; end: string }): Promise<ApiResponse<any[]>> {
    try {
      const { data, error } = await supabase
        .from('analytics_events')
        .select('*')
        .eq('event_type', 'error')
        .gte('created_at', timeRange.start)
        .lte('created_at', timeRange.end)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return { success: true, data: data || [] };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  // Alerts and Notifications
  async checkAlerts(organizationId?: string): Promise<void> {
    // This would typically be run by a background job
    // For now, we'll implement basic threshold checking
    try {
      const metrics = await this.getRealTimeMetrics(organizationId);
      if (!metrics.success || !metrics.data) return;

      const alerts = await this.getActiveAlerts(organizationId);
      
      for (const alert of alerts) {
        const currentValue = this.getMetricValue(metrics.data, alert.metric);
        if (this.shouldTriggerAlert(currentValue, alert)) {
          await this.triggerAlert(alert, currentValue);
        }
      }
    } catch (error) {
      console.error('Alert checking failed:', error);
    }
  }

  private async getActiveAlerts(organizationId?: string): Promise<AlertConfig[]> {
    // This would come from a database table in a real implementation
    return [];
  }

  private getMetricValue(metrics: DashboardMetrics, metricName: string): number {
    switch (metricName) {
      case 'total_users': return metrics.totalUsers;
      case 'active_users': return metrics.activeUsers;
      case 'total_files': return metrics.totalFiles;
      case 'total_storage': return metrics.totalStorage;
      case 'total_revenue': return metrics.totalRevenue;
      default: return 0;
    }
  }

  private shouldTriggerAlert(currentValue: number, alert: AlertConfig): boolean {
    switch (alert.condition) {
      case 'greater_than': return currentValue > alert.threshold;
      case 'less_than': return currentValue < alert.threshold;
      case 'equals': return currentValue === alert.threshold;
      default: return false;
    }
  }

  private async triggerAlert(alert: AlertConfig, currentValue: number): Promise<void> {
    await this.track('alert_triggered', {
      alert_id: alert.id,
      alert_name: alert.name,
      metric: alert.metric,
      threshold: alert.threshold,
      current_value: currentValue,
    });

    // Here you would send notifications via email, Slack, etc.
    console.log(`Alert triggered: ${alert.name} - ${alert.metric} is ${currentValue} (threshold: ${alert.threshold})`);
  }

  // API Usage Metrics
  async getApiUsageMetrics(userId: string, organizationId: string): Promise<ApiResponse<ApiUsageMetrics>> {
    try {
      // Mock data for now - in production, this would query actual API usage logs
      const mockMetrics: ApiUsageMetrics = {
        totalRequests: 15420,
        successfulRequests: 14890,
        failedRequests: 530,
        averageResponseTime: 245,
        requestsPerDay: [
          { date: '2024-01-01', count: 1200 },
          { date: '2024-01-02', count: 1350 },
          { date: '2024-01-03', count: 1180 },
          { date: '2024-01-04', count: 1420 },
          { date: '2024-01-05', count: 1290 },
          { date: '2024-01-06', count: 1380 },
          { date: '2024-01-07', count: 1600 },
        ],
        topEndpoints: [
          { endpoint: '/api/upload', count: 8500 },
          { endpoint: '/api/download', count: 4200 },
          { endpoint: '/api/files', count: 2100 },
          { endpoint: '/api/auth', count: 620 },
        ],
        errorRates: [
          { date: '2024-01-01', rate: 3.2 },
          { date: '2024-01-02', rate: 2.8 },
          { date: '2024-01-03', rate: 4.1 },
          { date: '2024-01-04', rate: 3.5 },
          { date: '2024-01-05', rate: 2.9 },
          { date: '2024-01-06', rate: 3.8 },
          { date: '2024-01-07', rate: 3.4 },
        ],
      };

      return { success: true, data: mockMetrics };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  // Cleanup
  destroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    // Flush any remaining events
    this.flushEvents();
  }
}

export const analyticsService = AnalyticsService.getInstance();
export default analyticsService;