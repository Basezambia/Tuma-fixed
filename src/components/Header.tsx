import { useState, useEffect } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { Menu, Moon, Sun, X, Bell } from "lucide-react";
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

// Notification Bell Component
const NotificationBell = () => {
  const [hasNotification, setHasNotification] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<Array<{id: string, message: string, timestamp: number}>>([]);

  // Listen for upload completion events
  useEffect(() => {
    const handleUploadComplete = (event: CustomEvent) => {
      const { fileName, success, error } = event.detail;
      
      if (success) {
        const newNotification = {
          id: Date.now().toString(),
          message: `File "${fileName}" uploaded successfully`,
          timestamp: Date.now()
        };
        setNotifications(prev => [newNotification, ...prev.slice(0, 9)]); // Keep last 10
        setHasNotification(true);
      }
      // Don't show notification for failed uploads - they'll get error messages instead
    };

    window.addEventListener('uploadComplete', handleUploadComplete as EventListener);
    return () => window.removeEventListener('uploadComplete', handleUploadComplete as EventListener);
  }, []);

  const handleBellClick = () => {
    setShowNotifications(!showNotifications);
    if (hasNotification) {
      setHasNotification(false);
    }
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
                <div key={notification.id} className="p-3 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
                  <p className="text-sm text-gray-800 dark:text-gray-200">{notification.message}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {new Date(notification.timestamp).toLocaleTimeString()}
                  </p>
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
  const { isConnected } = useAccount();
  const location = useLocation();

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY === 0) {
        setShowHeader(true);
      } else {
        setShowHeader(false);
      }
      setLastScrollY(window.scrollY);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 px-6 py-4 transition-transform duration-300 ${showHeader ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'} bg-transparent dark:bg-gray-900`}
    >
      <div className={`${location.pathname === '/landing' ? 'bg-transparent border-none shadow-none backdrop-blur-none' : 'bg-transparent border-none shadow-none'} dark:bg-gray-900 rounded-xl mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16 transition-all duration-300`}>
        <div className="flex items-center">
          <NavLink to="/send" className="text-xl font-bold bg-gradient-to-r from-doc-deep-blue to-blue-500 bg-clip-text text-transparent focus:outline-none focus:ring-2 focus:ring-blue-400 rounded transition-colors duration-200">
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
            <nav className="hidden md:flex items-center space-x-1">
              {[{ name: 'Send', path: '/send' }, { name: 'Documents', path: '/documents' }, { name: 'Profile', path: '/profile' }, { name: 'About', path: '/about' }]
                .filter(link => link.path !== location.pathname)
                .map(link => (
                  <NavLink
                    key={link.path}
                    to={link.path}
                    className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}
                  >
                    {link.name}
                  </NavLink>
                ))}
              <div className="ml-6 z-50">
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
              <div style={{ marginLeft: '1.5rem' }}>                
                <NotificationBell />
              </div>
              {/* Dark mode toggle is now hidden - removed the entire div */}
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
        <div className="backdrop-blur-xl bg-white/40 dark:bg-[#191919] border border-white/20 dark:border-[#232323] shadow-lg md:hidden mt-2 py-4 px-2 rounded-xl animate-scale-in">
          <nav className="flex flex-col space-y-3">
            {[{ name: 'Send', path: '/send' }, { name: 'Documents', path: '/documents' }, { name: 'Profile', path: '/profile' }, { name: 'About', path: '/about' }]
              .filter(link => link.path !== location.pathname)
              .map(link => (
                <NavLink
                  key={link.path}
                  to={link.path}
                  className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}
                  onClick={() => setIsMenuOpen(false)}
                >
                  {link.name}
                </NavLink>
              ))}
            <div className="pt-2 flex items-center justify-between">
              {/* Only render Wallet on mobile, with full dropdown and identity */}
              {isMobile && isConnected && (
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
                    <WalletDropdownLink icon="info-circle" href="/about">
                      About
                    </WalletDropdownLink>
                    <WalletDropdownLink icon="wallet" href="https://keys.coinbase.com">
                      Wallet
                    </WalletDropdownLink>
                    <WalletDropdownFundLink />
                    <WalletDropdownDisconnect />
                  </WalletDropdown>
                </Wallet>
              )}
              <div className="relative group">
                <Toggle 
                  aria-label="Dark mode coming soon"
                  className="p-2 rounded-full cursor-not-allowed opacity-70"
                  pressed={false}
                  onPressedChange={() => toast.info("Dark mode coming soon!")}
                >
                  <Sun size={18} />
                </Toggle>
                <div className="absolute top-12 left-1/2 transform -translate-x-1/2 bg-black text-white text-xs rounded py-1 px-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap pointer-events-none">
                  Coming Soon
                </div>
              </div>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
};

export default Header;
