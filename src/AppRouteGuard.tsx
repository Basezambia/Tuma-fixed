import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { fileMonitorService } from '@/lib/file-monitor-service';

export default function AppRouteGuard({ children }: { children: React.ReactNode }) {
  const { isConnected, address } = useAccount();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!isConnected) {
      // If not connected, always show landing
      if (location.pathname !== '/landing') {
        navigate('/landing', { replace: true });
      }
      // Stop file monitoring when disconnected
      fileMonitorService.stopMonitoring();
    } else {
      // If connected, always go to /send (unless already there)
      if (location.pathname === '/landing' || location.pathname === '/') {
        navigate('/send', { replace: true });
      }
    }
  }, [isConnected, location.pathname, navigate]);

  // Start file monitoring when wallet is connected
  useEffect(() => {
    if (isConnected && address) {
      // Start monitoring for file changes every 30 seconds
      fileMonitorService.startMonitoring(address);
      console.log('File monitoring started for address:', address);
    }

    // Cleanup on unmount
    return () => {
      if (!isConnected) {
        fileMonitorService.stopMonitoring();
      }
    };
  }, [isConnected, address]);

  // Only render children if the correct route is active
  if (!isConnected && location.pathname !== '/landing') {
    return null;
  }
  if (isConnected && (location.pathname === '/landing' || location.pathname === '/')) {
    return null;
  }
  return <>{children}</>;
}
