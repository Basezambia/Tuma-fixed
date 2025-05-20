import { useState, useEffect } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { Menu, Moon, Sun, X } from "lucide-react";
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
      className={`fixed top-0 left-0 right-0 z-50 px-6 py-4 transition-transform duration-300 ${showHeader ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'} bg-white dark:bg-[#191919]`}
    >
      <div className={`${location.pathname === '/landing' ? 'bg-transparent border-none shadow-none backdrop-blur-none' : 'backdrop-blur-xl bg-white/40 dark:bg-[#191919] border border-white/20 dark:border-[#232323] shadow-lg'} rounded-xl mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16 transition-all duration-300 ${location.pathname !== '/landing' ? 'hover:bg-white/50 dark:hover:bg-[#232323]/90' : ''}`}>
        <div className="flex items-center">
          <NavLink to="/send" className="text-xl font-bold bg-gradient-to-r from-doc-deep-blue to-blue-500 bg-clip-text text-transparent focus:outline-none focus:ring-2 focus:ring-blue-400 rounded transition-colors duration-200">
            TUMA
          </NavLink>
        </div>

        {isConnected ? (
          isMobile ? (
            <button 
              onClick={toggleMenu} 
              className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Toggle menu"
            >
              {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
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
                <div className="relative group">
                  <button 
                    aria-label="Dark Mode Coming Soon"
                    className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center space-x-1 text-xs font-medium"
                    onClick={() => toast.info('Dark Mode Coming Soon!')}
                  >
                    <Sun size={20} />
                    <span>Dark Mode Coming Soon</span>
                  </button>
                  <div className="absolute hidden group-hover:block top-full mt-1 right-0 bg-white dark:bg-gray-800 shadow-lg rounded-md px-3 py-1 text-sm whitespace-nowrap">
                    Coming Soon
                  </div>
                </div>
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
                <button 
                  aria-label="Dark Mode Coming Soon"
                  className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center space-x-1 text-xs font-medium"
                  onClick={() => {
                    toast.info('Dark Mode Coming Soon!');
                    setIsMenuOpen(false); // Close mobile menu after clicking
                  }}
                >
                  <Sun size={18} />
                  <span>Dark Mode Coming Soon</span>
                </button>
                <div className="absolute hidden group-hover:block top-full mt-1 right-0 bg-white dark:bg-gray-800 shadow-lg rounded-md px-3 py-1 text-sm whitespace-nowrap">
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
