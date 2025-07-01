import React from 'react';
import { useAccount } from 'wagmi';
import { useNavigate } from 'react-router-dom';
import Header from '@/components/Header';
import StorageDashboard from '@/components/StorageDashboard';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

const Storage = () => {
  const { address, isConnected } = useAccount();
  const navigate = useNavigate();

  if (!isConnected || !address) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-white to-blue-50 dark:from-[#191919] dark:to-[#191919]">
        <Header />
        <main className="pt-20 sm:pt-28 px-3 sm:px-4 lg:px-6 pb-12 sm:pb-16 max-w-7xl mx-auto">
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight dark:text-white mb-4">Storage Dashboard</h1>
            <p className="text-gray-600 dark:text-gray-400">Please connect your wallet to access the storage dashboard.</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-blue-50 dark:from-[#191919] dark:to-[#191919] page-transition">
      <Header />
      <main className="pt-20 sm:pt-28 px-3 sm:px-4 lg:px-6 pb-12 sm:pb-16 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 sm:mb-8 gap-4">
          <div className="flex items-center gap-4">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => navigate('/profile')}
              className="flex items-center gap-2"
            >
              <ArrowLeft size={16} />
              Back to Profile
            </Button>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight dark:text-white">Storage Dashboard</h1>
          </div>
        </div>
        
        <StorageDashboard 
          userId={address} 
          walletAddress={address}
          onOpenMarketplace={() => {/* Handle marketplace opening */}}
        />
      </main>
    </div>
  );
};

export default Storage;