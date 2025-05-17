import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAccount } from 'wagmi';

export default function AppRouteGuard({ children }: { children: React.ReactNode }) {
  const { isConnected } = useAccount();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!isConnected) {
      // If not connected, always show landing
      if (location.pathname !== '/landing') {
        navigate('/landing', { replace: true });
      }
    } else {
      // If connected, always go to /send (unless already there)
      if (location.pathname === '/landing' || location.pathname === '/') {
        navigate('/send', { replace: true });
      }
    }
  }, [isConnected, location.pathname, navigate]);

  // Only render children if the correct route is active
  if (!isConnected && location.pathname !== '/landing') {
    return null;
  }
  if (isConnected && (location.pathname === '/landing' || location.pathname === '/')) {
    return null;
  }
  return <>{children}</>;
}
