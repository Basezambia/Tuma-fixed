import { arweaveService, StoredFile } from './arweave-service';
import { toast } from 'sonner';

class FileMonitorService {
  private intervalId: NodeJS.Timeout | null = null;
  private isMonitoring = false;
  private userAddress: string | null = null;
  private lastReceivedCount = 0;
  private lastSentCount = 0;
  private lastReceivedFiles: StoredFile[] = [];
  private lastSentFiles: StoredFile[] = [];
  private readonly POLL_INTERVAL = 30000; // 30 seconds

  /**
   * Start monitoring for file changes
   */
  startMonitoring(address: string) {
    if (this.isMonitoring && this.userAddress === address.toLowerCase()) {
      return; // Already monitoring for this address
    }

    this.stopMonitoring(); // Stop any existing monitoring
    this.userAddress = address.toLowerCase();
    this.isMonitoring = true;

    // Initialize baseline counts
    this.initializeBaseline();

    // Start polling
    this.intervalId = setInterval(() => {
      this.checkForChanges();
    }, this.POLL_INTERVAL);

    console.log(`File monitoring started for address: ${address}`);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isMonitoring = false;
    this.userAddress = null;
    this.lastReceivedCount = 0;
    this.lastSentCount = 0;
    this.lastReceivedFiles = [];
    this.lastSentFiles = [];
    console.log('File monitoring stopped');
  }

  /**
   * Initialize baseline file counts and data
   */
  private async initializeBaseline() {
    if (!this.userAddress) return;

    try {
      const [receivedFiles, sentFiles] = await Promise.all([
        arweaveService.getReceivedFiles(this.userAddress),
        arweaveService.getSentFiles(this.userAddress)
      ]);

      // Filter out vault files
      const filteredReceived = receivedFiles.filter(file => 
        !file.metadata.description?.includes("[VAULT]") &&
        !file.metadata.documentId?.startsWith("vault_")
      );
      
      const filteredSent = sentFiles.filter(file => 
        !file.metadata.description?.includes("[VAULT]") &&
        !file.metadata.documentId?.startsWith("vault_")
      );

      this.lastReceivedCount = filteredReceived.length;
      this.lastSentCount = filteredSent.length;
      this.lastReceivedFiles = filteredReceived;
      this.lastSentFiles = filteredSent;

      console.log(`Baseline initialized - Received: ${this.lastReceivedCount}, Sent: ${this.lastSentCount}`);
    } catch (error) {
      console.error('Error initializing baseline:', error);
    }
  }

  /**
   * Check for file changes and emit events
   */
  private async checkForChanges() {
    if (!this.userAddress || !this.isMonitoring) return;

    try {
      const [receivedFiles, sentFiles] = await Promise.all([
        arweaveService.getReceivedFiles(this.userAddress),
        arweaveService.getSentFiles(this.userAddress)
      ]);

      // Filter out vault files
      const filteredReceived = receivedFiles.filter(file => 
        !file.metadata.description?.includes("[VAULT]") &&
        !file.metadata.documentId?.startsWith("vault_")
      );
      
      const filteredSent = sentFiles.filter(file => 
        !file.metadata.description?.includes("[VAULT]") &&
        !file.metadata.documentId?.startsWith("vault_")
      );

      // Check for new received files
      const newReceivedFiles = filteredReceived.filter(file => 
        !this.lastReceivedFiles.some(lastFile => lastFile.id === file.id)
      );

      // Check for new sent files
      const newSentFiles = filteredSent.filter(file => 
        !this.lastSentFiles.some(lastFile => lastFile.id === file.id)
      );

      // Handle new received files
      if (newReceivedFiles.length > 0) {
        console.log(`Detected ${newReceivedFiles.length} new received file(s)`);
        
        // Show notification
        toast.success(`${newReceivedFiles.length} new file(s) received!`, {
          description: newReceivedFiles.length === 1 
            ? `"${newReceivedFiles[0].metadata.name}" from ${newReceivedFiles[0].metadata.sender.slice(0, 6)}...${newReceivedFiles[0].metadata.sender.slice(-4)}`
            : `${newReceivedFiles.length} files received`,
          duration: 5000,
          action: {
            label: 'View Files',
            onClick: () => {
              window.location.href = '/documents?tab=received';
            }
          }
        });

        // Emit events for each new received file
        newReceivedFiles.forEach(file => {
          const event = new CustomEvent('tuma:newReceivedFile', {
            detail: { id: file.id, metadata: file.metadata }
          });
          window.dispatchEvent(event);
        });

        // Refresh the page to show new files
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      }

      // Handle sent file counter changes
      if (filteredSent.length > this.lastSentCount) {
        const newSentCount = filteredSent.length - this.lastSentCount;
        console.log(`Detected ${newSentCount} new sent file(s)`);
        
        // Show notification for sent files counter change
        toast.info(`${newSentCount} file(s) sent successfully!`, {
          description: newSentCount === 1 
            ? `"${newSentFiles[0]?.metadata.name || 'File'}" sent`
            : `${newSentCount} files sent`,
          duration: 4000,
          action: {
            label: 'View Sent',
            onClick: () => {
              window.location.href = '/documents?tab=sent';
            }
          }
        });

        // Emit events for each new sent file
        newSentFiles.forEach(file => {
          const event = new CustomEvent('tuma:newSentFile', {
            detail: { id: file.id, metadata: file.metadata }
          });
          window.dispatchEvent(event);
        });
      }

      // Update baseline data
      this.lastReceivedCount = filteredReceived.length;
      this.lastSentCount = filteredSent.length;
      this.lastReceivedFiles = filteredReceived;
      this.lastSentFiles = filteredSent;

    } catch (error) {
      console.error('Error checking for file changes:', error);
      // Don't show error toast for background polling to avoid spam
    }
  }

  /**
   * Get current monitoring status
   */
  getStatus() {
    return {
      isMonitoring: this.isMonitoring,
      userAddress: this.userAddress,
      lastReceivedCount: this.lastReceivedCount,
      lastSentCount: this.lastSentCount
    };
  }

  /**
   * Force a check for changes (useful for manual refresh)
   */
  async forceCheck() {
    if (this.isMonitoring) {
      await this.checkForChanges();
    }
  }
}

// Export singleton instance
export const fileMonitorService = new FileMonitorService();
export default fileMonitorService;