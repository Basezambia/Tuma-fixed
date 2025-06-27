import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { Menu, Moon, Sun, X, Bell, Building2 } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAccount } from 'wagmi';
import { toast } from "sonner";
import { 
  Wallet, 
  ConnectWallet, 
  WalletDropdown, 
  WalletDropdownLink, 
  WalletDropdownFundLink, 
  WalletDropdownDisconnect 
} from '@coinbase/onchainkit/wallet';
import { 
  Identity, 
  Avatar, 
  Name, 
  Address, 
  EthBalance 
} from '@coinbase/onchainkit/identity';
import { Toggle } from "@/components/ui/toggle";
import { useTheme } from "@/hooks/use-theme";
import { base } from 'viem/chains';
import { enterpriseService } from '@/lib/enterprise-service';

// Notification Bell Component
const NotificationBell = () => {
  const [hasNotification, setHasNotification] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<Array<{id: string, message: string, timestamp: number, type: 'sent' | 'received', fileId?: string}>>([]);
  const navigate = useNavigate();
  const { address: userAddress } = useAccount();

  // Load notifications and notification state from localStorage on mount
  useEffect(() => {
    if (userAddress) {
      const notificationKey = `tuma_notifications_${userAddress.toLowerCase()}`;
      const hasNotificationKey = `tuma_has_notification_${userAddress.toLowerCase()}`;
      
      const savedNotifications = localStorage.getItem(notificationKey);
      const savedHasNotification = localStorage.getItem(hasNotificationKey);
      
      if (savedNotifications) {
        try {
          const parsed = JSON.parse(savedNotifications);
          setNotifications(parsed);
        } catch (error) {
          console.error('Error parsing saved notifications:', error);
        }
      }
      
      if (savedHasNotification === 'true') {
        setHasNotification(true);
      }
    }
  }, [userAddress]);

  // Save notifications to localStorage whenever they change
  useEffect(() => {
    if (userAddress && notifications.length > 0) {
      const notificationKey = `tuma_notifications_${userAddress.toLowerCase()}`;
      localStorage.setItem(notificationKey, JSON.stringify(notifications));
    }
  }, [notifications, userAddress]);

  // Save hasNotification state to localStorage whenever it changes
  useEffect(() => {
    if (userAddress) {
      const hasNotificationKey = `tuma_has_notification_${userAddress.toLowerCase()}`;
      localStorage.setItem(hasNotificationKey, hasNotification.toString());
    }
  }, [hasNotification, userAddress]);

  // Listen for upload completion events (sent files)
  useEffect(() => {
    const handleUploadComplete = (event: CustomEvent) => {
      const { fileName, success, error } = event.detail;
      
      if (success) {
        const newNotification = {
          id: Date.now().toString(),
          message: `File "${fileName}" sent successfully`,
          timestamp: Date.now(),
          type: 'sent' as const
        };
        setNotifications(prev => {
          const updated = [newNotification, ...prev].slice(0, 4); // Keep only latest 5 notifications
          return updated.sort((a, b) => b.timestamp - a.timestamp); // Sort by latest first
        });
        setHasNotification(true);
      }
      // Don't show notification for failed uploads - they'll get error messages instead
    };

    window.addEventListener('uploadComplete', handleUploadComplete as EventListener);
    return () => window.removeEventListener('uploadComplete', handleUploadComplete as EventListener);
  }, []);

  // Listen for new sent files
  useEffect(() => {
    const handleNewSentFile = (event: CustomEvent) => {
      const { id, metadata } = event.detail;
      if (metadata && metadata.sender && metadata.sender.toLowerCase() === userAddress?.toLowerCase()) {
        // Show notification for vault files (when isVault is true)
        if (metadata.isVault) {
          const newNotification = {
            id: `vault-${id}`,
            message: `File "${metadata.name}" uploaded to vault successfully`,
            timestamp: Date.now(),
            type: 'sent' as const,
            fileId: id
          };
          setNotifications(prev => {
            const updated = [newNotification, ...prev].slice(0, 4); // Keep only latest 5 notifications
            return updated.sort((a, b) => b.timestamp - a.timestamp); // Sort by latest first
          });
          setHasNotification(true);
          return;
        }
        
        // Don't show notification if user sent file to themselves (non-vault)
        if (metadata.recipient && metadata.recipient.toLowerCase() === userAddress?.toLowerCase()) {
          return;
        }
        
        const newNotification = {
          id: `sent-${id}`,
          message: `File "${metadata.name}" sent to ${metadata.recipient.slice(0, 6)}...${metadata.recipient.slice(-4)}`,
          timestamp: Date.now(),
          type: 'sent' as const,
          fileId: id
        };
        setNotifications(prev => {
          const updated = [newNotification, ...prev].slice(0, 4); // Keep only latest 5 notifications
          return updated.sort((a, b) => b.timestamp - a.timestamp); // Sort by latest first
        });
        setHasNotification(true);
      }
    };

    window.addEventListener('tuma:newSentFile', handleNewSentFile as EventListener);
    return () => window.removeEventListener('tuma:newSentFile', handleNewSentFile as EventListener);
  }, [userAddress]);

  // Listen for new received files
  useEffect(() => {
    const handleNewReceivedFile = (event: CustomEvent) => {
      const { id, metadata } = event.detail;
      if (metadata && metadata.recipient && metadata.recipient.toLowerCase() === userAddress?.toLowerCase()) {
        // Don't show notification if user received file from themselves (shouldn't happen, but safety check)
        if (metadata.sender && metadata.sender.toLowerCase() === userAddress?.toLowerCase()) {
          return;
        }
        
        const newNotification = {
          id: `received-${id}`,
          message: `File "${metadata.name}" received from ${metadata.sender.slice(0, 6)}...${metadata.sender.slice(-4)}`,
          timestamp: Date.now(),
          type: 'received' as const,
          fileId: id
        };
        setNotifications(prev => {
          const updated = [newNotification, ...prev].slice(0, 4); // Keep only latest 5 notifications
          return updated.sort((a, b) => b.timestamp - a.timestamp); // Sort by latest first
        });
        setHasNotification(true);
      }
    };

    window.addEventListener('tuma:newReceivedFile', handleNewReceivedFile as EventListener);
    return () => window.removeEventListener('tuma:newReceivedFile', handleNewReceivedFile as EventListener);
  }, [userAddress]);

  const handleBellClick = () => {
    setShowNotifications(!showNotifications);
    if (hasNotification) {
      setHasNotification(false);
      // Clear the notification state and notifications from localStorage when user checks notifications
      if (userAddress) {
        const hasNotificationKey = `tuma_has_notification_${userAddress.toLowerCase()}`;
        const notificationKey = `tuma_notifications_${userAddress.toLowerCase()}`;
        localStorage.setItem(hasNotificationKey, 'false');
        // Clear all notifications when bell is clicked
        localStorage.removeItem(notificationKey);
        setNotifications([]);
      }
    }
  };

  const handleNotificationClick = (notification: typeof notifications[0]) => {
    // Navigate to documents page with appropriate tab
    const tab = notification.type === 'received' ? 'received' : 'sent';
    navigate(`/documents?tab=${tab}`);
    setShowNotifications(false);
  };

  return (
    <div className="relative">
      <button
        onClick={handleBellClick}
        className={`p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors relative ${
          hasNotification ? 'animate-pulse' : ''
        }`}
        aria-label="Notifications"
      >
        <Bell size={16} className="text-gray-500 dark:text-gray-400" />
        {hasNotification && (
          <div className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
        )}
      </button>
      
      {showNotifications && (
        <div className="absolute top-12 right-0 w-80 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50">
          <div className="p-3 border-b border-gray-200 dark:border-gray-700">
            <h3 className="font-medium text-sm">Notifications</h3>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {notifications.length > 0 ? (
              notifications.map((notification) => (
                <div 
                  key={notification.id} 
                  className="p-3 border-b border-gray-100 dark:border-gray-700 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors"
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="text-sm text-gray-800 dark:text-gray-200">{notification.message}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {new Date(notification.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                    <div className={`ml-2 px-2 py-1 rounded-full text-xs font-medium ${
                      notification.type === 'received' 
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                    }`}>
                      {notification.type === 'received' ? 'Received' : 'Sent'}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-4 text-center text-gray-500 dark:text-gray-400 text-sm">
                No notifications
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const isMobile = useIsMobile();
  const { theme, setTheme } = useTheme();
  const [showHeader, setShowHeader] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(window.scrollY);
  const navigate = useNavigate();
  const { isConnected, address } = useAccount();
  const location = useLocation();
  const [hasOrganization, setHasOrganization] = useState(false);
  const [isCheckingOrganization, setIsCheckingOrganization] = useState(false);

  // Check if user belongs to any organization
  useEffect(() => {
    const checkOrganizationMembership = async () => {
      if (!address) {
        setHasOrganization(false);
        return;
      }

      setIsCheckingOrganization(true);
      try {
        const result = await enterpriseService.getUserOrganizations(address);
        if (result.success && result.data && result.data.length > 0) {
          setHasOrganization(true);
        } else {
          setHasOrganization(false);
        }
      } catch (error) {
        console.error('Failed to check organization membership:', error);
        setHasOrganization(false);
      } finally {
        setIsCheckingOrganization(false);
      }
    };

    checkOrganizationMembership();
  }, [address]);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      
      // Always show header at the top
      if (currentScrollY === 0) {
        setShowHeader(true);
      } else if (currentScrollY < lastScrollY) {
        // Scrolling up - show header
        setShowHeader(true);
      } else if (currentScrollY > lastScrollY && currentScrollY > 100) {
        // Scrolling down and past 100px - hide header
        setShowHeader(false);
      }
      
      setLastScrollY(currentScrollY);
    };
    
    window.addEventListener("scroll", handleScroll, { passive: true });
     return () => window.removeEventListener("scroll", handleScroll);
   }, [lastScrollY]);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  return (
    <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ease-in-out ${
      showHeader ? 'translate-y-0' : '-translate-y-full'
    } ${lastScrollY > 10 ? 'bg-white/80 dark:bg-gray-900/80 backdrop-blur-md shadow-sm' : 'bg-transparent'}`}>
      <div className="mx-auto max-w-7xl px-2 sm:px-4 lg:px-8 flex items-center justify-between h-16 min-w-0">
        <div className="flex items-center min-w-0 flex-shrink-0">
          <NavLink to="/send" className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white hover:text-green-600 dark:hover:text-green-400 transition-colors whitespace-nowrap">
            TUMA
          </NavLink>
        </div>

        {isConnected ? (
          isMobile ? (
            <div className="flex items-center space-x-2">
              <NotificationBell />
              <button 
                onClick={toggleMenu} 
                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                aria-label="Toggle menu"
              >
                {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
            </div>
          ) : (
            <nav className="hidden md:flex items-center space-x-8">
              {[
                { name: 'Send', path: '/send' }, 
                { name: 'Documents', path: '/documents' }, 
                { name: 'Profile', path: '/profile' }, 
                { name: 'About', path: '/about' }
              ]
                .filter(link => link.path !== location.pathname)
                .map(link => (
                  <NavLink
                    key={link.path}
                    to={link.path}
                    className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white font-medium transition-colors"
                  >
                    {link.name}
                  </NavLink>
                ))}
              <div className="flex items-center space-x-4">
                <NotificationBell />
                <Wallet>
                  <ConnectWallet disconnectedLabel="Log In">
                    <Name />
                  </ConnectWallet>
                  <WalletDropdown>
                    <Identity className="px-4 pt-3 pb-2" hasCopyAddressOnClick>
                      <Avatar />
                      <Name />
                      <Address />
                      <EthBalance />
                    </Identity>
                    <WalletDropdownLink icon="wallet" href="https://keys.coinbase.com">
                      Wallet
                    </WalletDropdownLink>
                    <WalletDropdownFundLink />
                    <WalletDropdownDisconnect />
                  </WalletDropdown>
                </Wallet>
              </div>
            </nav>
          )
        ) : (
          <ConnectWallet disconnectedLabel="Log In">
            <Name />
          </ConnectWallet>
        )}
      </div>

      {/* Mobile menu, show/hide based on menu state */}
      {isMobile && isMenuOpen && (
        <div className="bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 md:hidden">
          <nav className="flex flex-col py-4 px-4 space-y-2">
            {[
              { name: 'Send', path: '/send' }, 
              { name: 'Documents', path: '/documents' }, 
              { name: 'Profile', path: '/profile' }, 
              { name: 'About', path: '/about' }
            ]
              .filter(link => link.path !== location.pathname)
              .map(link => (
                <NavLink
                  key={link.path}
                  to={link.path}
                  className="block py-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white font-medium transition-colors"
                  onClick={() => setIsMenuOpen(false)}
                >
                  {link.name}
                </NavLink>
              ))}
            {isMobile && isConnected && (
              <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                <Wallet>
                  <ConnectWallet disconnectedLabel="Log In">
                    <Name />
                  </ConnectWallet>
                  <WalletDropdown>
                    <Identity className="px-4 pt-3 pb-2" hasCopyAddressOnClick>
                      <Avatar />
                      <Name />
                      <Address />
                      <EthBalance />
                    </Identity>
                    <WalletDropdownLink icon="wallet" href="https://keys.coinbase.com">
                      Wallet
                    </WalletDropdownLink>
                    <WalletDropdownFundLink />
                    <WalletDropdownDisconnect />
                  </WalletDropdown>
                </Wallet>
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  );
};

export default Header;
