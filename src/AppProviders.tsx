import type { ReactNode } from 'react';
import { OnchainKitProvider } from '@coinbase/onchainkit';
import { WagmiProvider } from 'wagmi';
import { config } from './wagmi';
import { base } from 'wagmi/chains';

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <OnchainKitProvider
        apiKey={import.meta.env.VITE_PUBLIC_ONCHAINKIT_API_KEY || 'x2oazcx7sSFU0P41ucJj2fJ6fePAmMZf'}
        projectId={import.meta.env.VITE_PUBLIC_PRODUCT_ID || 'ca407516-32fd-4113-8d1a-c997c1b1a7ec'}
        chain={base}
        config={{
          appearance: {
            name: 'TUMA',
            logo: '/logo.png',
            mode: 'auto',
            theme: 'default',
          },
          wallet: {
            display: 'modal',
            termsUrl: 'https://your-terms-url.com',
            privacyUrl: 'https://your-privacy-url.com',
            supportedWallets: {
              rabby: true,
              trust: true,
              frame: true,
            },
          },
        }}
      >
        {children}
      </OnchainKitProvider>
    </WagmiProvider>
  );
}
