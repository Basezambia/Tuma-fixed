import { useState } from "react";
import { Link, User, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ConnectWallet } from '@coinbase/onchainkit/wallet';

const ConnectButton = () => {
  const navigate = useNavigate();

  const handleDisconnect = () => {
    navigate('/landing');
  };

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <ConnectWallet
            onConnect={() => navigate('/send')}
            text="Connect"
            className={`
              relative inline-flex items-center gap-2 px-4 py-2 rounded-full 
              transition-all duration-300 
              bg-doc-deep-blue text-white hover:bg-blue-600 dark:bg-blue-800 dark:hover:bg-blue-700
              shadow-sm hover:shadow
            `}
          />
        </PopoverTrigger>
        
        <PopoverContent className="w-72 p-0 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="p-4 bg-gradient-to-r from-doc-deep-blue to-blue-500 dark:from-blue-900 dark:to-blue-700">
            <div className="flex justify-between items-center">
              <h3 className="text-white font-semibold">TUMA</h3>
              <span className="text-white/80 text-sm">Not Connected</span>
            </div>
          </div>
          
          <div className="p-2">
            <button 
              onClick={() => navigate('/documents')}
              className="w-full text-left px-4 py-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-2"
            >
              <span className="w-8 h-8 flex items-center justify-center bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
              </span>
              <span>My Files</span>
            </button>
            
            <button 
              onClick={() => navigate('/send')}
              className="w-full text-left px-4 py-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-2"
            >
              <span className="w-8 h-8 flex items-center justify-center bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded-full">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </span>
              <span>Send File</span>
            </button>
            
            <button 
              onClick={() => navigate('/profile')}
              className="w-full text-left px-4 py-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-2"
            >
              <span className="w-8 h-8 flex items-center justify-center bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded-full">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
              </span>
              <span>Dashboard</span>
            </button>
            
            <div className="h-px bg-gray-200 dark:bg-gray-700 my-2"></div>
            
            <button 
              onClick={handleDisconnect}
              className="w-full text-left px-4 py-2.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 transition-colors flex items-center gap-2"
            >
              <span className="w-8 h-8 flex items-center justify-center bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              </span>
              <span>Disconnect</span>
            </button>
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
};

export default ConnectButton;
