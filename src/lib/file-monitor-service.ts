import { arweaveService } from './arweave-service';

class FileMonitorService {
  private monitoringInterval: NodeJS.Timeout | null = null;
  private isMonitoring = false;
  private currentAddress: string | null = null;
  private lastReceivedCount = 0;
  private lastSentCount = 0;
  private readonly POLLING_INTERVAL = 30000; // 30 seconds

  /**
   * Start monitoring for new files for the given address
   */
  async startMonitoring(address: string): Promise<void> {
    if (this.isMonitoring && this.currentAddress === address.toLowerCase()) {
      return; // Already monitoring this address
    }

    // Stop any existing monitoring
    this.stopMonitoring();

    this.currentAddress = address.toLowerCase();
    this.isMonitoring = true;

    // Initialize baseline counts
    try {
      const [receivedFiles, sentFiles] = await Promise.all([
        arweaveService.getReceivedFiles(this.currentAddress),
        arweaveService.getSentFiles(this.currentAddress)
      ]);
      
      this.lastReceivedCount = receivedFiles.length;
      this.lastSentCount = sentFiles.length;
    } catch (error) {
      console.error('Failed to initialize file monitoring baseline:', error);
      this.lastReceivedCount = 0;
      this.lastSentCount = 0;
    }

    // Start periodic monitoring
    this.monitoringInterval = setInterval(() => {
      this.checkForNewFiles();
    }, this.POLLING_INTERVAL);

    console.log(`File monitoring started for address: ${address}`);
  }

  /**
   * Stop file monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    this.isMonitoring = false;
    this.currentAddress = null;
    this.lastReceivedCount = 0;
    this.lastSentCount = 0;
    
    console.log('File monitoring stopped');
  }

  /**
   * Check for new files and emit events if found
   */
  private async checkForNewFiles(): Promise<void> {
    if (!this.isMonitoring || !this.currentAddress) {
      return;
    }

    try {
      const [receivedFiles, sentFiles] = await Promise.all([
        arweaveService.getReceivedFiles(this.currentAddress),
        arweaveService.getSentFiles(this.currentAddress)
      ]);

      // Check for new received files
      if (receivedFiles.length > this.lastReceivedCount) {
        const newReceivedCount = receivedFiles.length - this.lastReceivedCount;
        console.log(`Found ${newReceivedCount} new received file(s)`);
        
        // Emit event for new received files
        window.dispatchEvent(new CustomEvent('tuma:newReceivedFile', {
          detail: {
            count: newReceivedCount,
            files: receivedFiles.slice(0, newReceivedCount)
          }
        }));
        
        this.lastReceivedCount = receivedFiles.length;
      }

      // Check for new sent files
      if (sentFiles.length > this.lastSentCount) {
        const newSentCount = sentFiles.length - this.lastSentCount;
        console.log(`Found ${newSentCount} new sent file(s)`);
        
        // Emit event for new sent files
        window.dispatchEvent(new CustomEvent('tuma:newSentFile', {
          detail: {
            count: newSentCount,
            files: sentFiles.slice(0, newSentCount)
          }
        }));
        
        this.lastSentCount = sentFiles.length;
      }
    } catch (error) {
      console.error('Error checking for new files:', error);
    }
  }

  /**
   * Get current monitoring status
   */
  getStatus(): { isMonitoring: boolean; address: string | null } {
    return {
      isMonitoring: this.isMonitoring,
      address: this.currentAddress
    };
  }

  /**
   * Force a check for new files (useful for manual refresh)
   */
  async forceCheck(): Promise<void> {
    if (this.isMonitoring) {
      await this.checkForNewFiles();
    }
  }
}

// Export singleton instance
export const fileMonitorService = new FileMonitorService();
export default fileMonitorService;