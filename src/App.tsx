import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "@/hooks/use-theme";
// import WalletConfigProvider from "@/hooks/use-wallet";
import { useEffect } from "react";
import Landing from "./pages/Landing";
import Documents from "./pages/Documents";
import Send from "./pages/Send";
import About from "./pages/About";
import Profile from "./pages/Profile";
import NotFound from "./pages/NotFound";
// import { OnchainKitProvider } from '@coinbase/onchainkit';
// import { base } from 'wagmi/chains';
import '@coinbase/onchainkit/styles.css';
import AppRouteGuard from './AppRouteGuard';

// Contract address on Base network
const CONTRACT_ADDRESS = "0x4B5F5f6A21F65AB74d6C0B8fE0C6B3Fc70267e38";

const queryClient = new QueryClient();

// Protected route component
interface ProtectedRouteProps {
  element: React.ReactNode;
}

const ProtectedRoute = ({ element }: ProtectedRouteProps) => {
  return <>{element}</>;
};

const AppContent = () => {
  // Detect initial theme preference
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const savedTheme = localStorage.getItem("tuma-ui-theme");
  const initialTheme = savedTheme || (prefersDark ? "dark" : "light");

  return (
    <ThemeProvider defaultTheme={initialTheme as "dark" | "light" | "system"}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <AppRouteGuard>
              <Routes>
                <Route path="/" element={<Navigate to="/landing" replace />} />
                <Route path="/landing" element={<Landing />} />
                <Route path="/about" element={<About />} />
                <Route path="/send" element={<ProtectedRoute element={<Send />} />} />
                <Route path="/documents" element={<ProtectedRoute element={<Documents />} />} />
                <Route path="/profile" element={<ProtectedRoute element={<Profile />} />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </AppRouteGuard>
          </BrowserRouter>
        </QueryClientProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
};

import { AppProviders } from './AppProviders';

export default function App() {
  return (
    <AppProviders>
      <AppContent />
    </AppProviders>
  );
}
