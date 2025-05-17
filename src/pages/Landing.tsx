import { useState } from "react";
import { ArrowRight, CheckCircle, Shield, Wallet } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Wallet as OnchainWallet } from '@coinbase/onchainkit/wallet';
import Header from "@/components/Header";

const Landing = () => {
  const navigate = useNavigate();
  const [isHovering, setIsHovering] = useState(false);

  const features = [
    {
      icon: <Shield className="h-6 w-6 text-doc-deep-blue dark:text-blue-400" />,
      title: "Secure Document Sharing",
      description: "End-to-end encryption ensures your files remain private and secure."
    },
    {
      icon: <Wallet className="h-6 w-6 text-doc-deep-blue dark:text-blue-400" />,
      title: "Blockchain-Powered",
      description: "Built on Base network with Arweave storage for permanent, decentralized file storage."
    },
    {
      icon: <CheckCircle className="h-6 w-6 text-doc-deep-blue dark:text-blue-400" />,
      title: "Simple Pricing",
      description: "Pay once for permanent storage. No subscriptions or hidden fees."
    }
  ];

  const pricingTiers = [
    { size: "Up to 10MB", price: "0.05 USDC" },
    { size: "10MB to 50MB", price: "1.00 USDC" },
    { size: "50MB to 100MB", price: "2.00 USDC" },
    { size: ">100MB", price: "5.00 USDC" }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-blue-50 dark:from-gray-900 dark:to-gray-800">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        {/* Particle Background */}
        <div className="particles">
          {Array.from({ length: 50 }).map((_, index) => (
            <div 
              key={index}
              className="particle animate-float"
              style={{
                width: `${Math.random() * 5 + 2}px`,
                height: `${Math.random() * 5 + 2}px`,
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                opacity: Math.random() * 0.5 + 0.3,
                animationDuration: `${Math.random() * 10 + 5}s`,
                animationDelay: `${Math.random() * 5}s`
              }}
            />
          ))}
        </div>
        
        {/* Background Image with Overlay */}
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-900/80 to-blue-700/70 mix-blend-multiply z-10 animate-gradient-shift"></div>
          <div 
            className="absolute inset-0 bg-cover bg-center z-0"
            style={{
              backgroundImage: "url('https://images.unsplash.com/photo-1557804506-669a67965ba0?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2574&q=80')",
              backgroundSize: 'cover',
              backgroundPosition: 'center'
            }}
          ></div>
        </div>
        
        {/* Header */}
        <Header />
        
        {/* Hero Content */}
        <div className="relative z-10 mx-auto max-w-7xl px-6 py-32 sm:py-36 lg:py-44 lg:px-8">
          <div className="text-center">
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-6xl drop-shadow-md animate-float">
              TUMA
            </h1>
            <div className="mt-6 bg-white/10 backdrop-blur-sm p-6 rounded-xl inline-block max-w-2xl animate-fade-in-up">
              <p className="text-lg leading-8 text-white/90">
                Share files securely with blockchain-powered encryption and permanent storage. 
                Connect your wallet to start sending and receiving files.
              </p>
            </div>
          </div>
        </div>
        
        {/* Divider: simple premium line instead of wave */}
        <div className="absolute bottom-0 left-0 right-0 z-10 translate-y-1">
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            viewBox="0 0 1440 6" 
            preserveAspectRatio="none" 
            className="w-full h-3 -mb-1"
            style={{ display: 'block' }}
          >
            <defs>
              <linearGradient id="dividerLineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#fffbe6" />
                <stop offset="100%" stopColor="#f6e7d7" />
              </linearGradient>
            </defs>
            <line x1="0" y1="3" x2="1440" y2="3" stroke="url(#dividerLineGradient)" strokeWidth="4" strokeLinecap="round" />
          </svg>
        </div>
      </div>

      {/* Features Section - Adjusted to reduce spacing */}
      <div className="pt-12 pb-16 sm:pt-16 sm:pb-24 relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 z-0 opacity-20 dark:opacity-30">
          <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="premiumGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#0f2027" />
                <stop offset="40%" stopColor="#2c5364" />
                <stop offset="100%" stopColor="#FFD700" stopOpacity="0.10" />
              </linearGradient>
              <radialGradient id="goldGlow" cx="80%" cy="20%" r="70%">
                <stop offset="0%" stopColor="#FFD700" stopOpacity="0.20" />
                <stop offset="100%" stopColor="#2c5364" stopOpacity="0" />
              </radialGradient>
            </defs>
            <rect width="100%" height="100%" fill="url(#premiumGradient)" />
            <circle cx="80%" cy="20%" r="180" fill="url(#goldGlow)" />
          </svg>
        </div>
        <div className="mx-auto max-w-7xl px-6 lg:px-8 relative z-10">
          <div className="mx-auto max-w-2xl lg:text-center">
            <h2 className="text-base font-semibold leading-7 text-doc-deep-blue dark:text-blue-400">Secure by Design</h2>
            <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
              Everything you need for secure document sharing
            </p>
            <p className="mt-6 text-lg leading-8 text-gray-600 dark:text-gray-300">
              TUMA provides a seamless experience for sending and receiving files with blockchain security and permanent storage.
            </p>
          </div>
          <div className="mx-auto mt-12 max-w-2xl sm:mt-16 lg:mt-18 lg:max-w-4xl">
            <dl className="grid max-w-xl grid-cols-1 gap-x-8 gap-y-8 lg:max-w-none lg:grid-cols-3 lg:gap-y-12">
              {features.map((feature, index) => (
                <div 
                  key={index} 
                  className={`relative pl-16 hover-float transition-all duration-300 animate-fade-in-up delay-${index * 100}`}
                >
                  <div className="hover-glow rounded-xl p-4 transition-all duration-300">
                    <dt className="text-base font-semibold leading-7 text-gray-900 dark:text-white">
                      <div className="absolute left-0 top-0 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900 animate-pulse-subtle">
                        {feature.icon}
                      </div>
                      {feature.title}
                    </dt>
                    <dd className="mt-2 text-base leading-7 text-gray-600 dark:text-gray-300">{feature.description}</dd>
                  </div>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>

      {/* Pricing Section - Adjusted spacing */}
      <div className="py-16 sm:py-24 relative overflow-hidden">
        {/* Premium Background Pattern */}
        <div className="absolute inset-0 z-0 opacity-20 dark:opacity-30">
          <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="premiumGradient2" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#0f2027" />
                <stop offset="40%" stopColor="#2c5364" />
                <stop offset="100%" stopColor="#FFD700" stopOpacity="0.10" />
              </linearGradient>
              <radialGradient id="goldGlow2" cx="80%" cy="20%" r="70%">
                <stop offset="0%" stopColor="#FFD700" stopOpacity="0.20" />
                <stop offset="100%" stopColor="#2c5364" stopOpacity="0" />
              </radialGradient>
            </defs>
            <rect width="100%" height="100%" fill="url(#premiumGradient2)" />
            <circle cx="80%" cy="20%" r="180" fill="url(#goldGlow2)" />
          </svg>
        </div>
        <div className="mx-auto max-w-7xl px-6 lg:px-8 relative z-10">
          <div className="mx-auto max-w-2xl lg:text-center">
            <h2 className="text-base font-semibold leading-7 text-doc-deep-blue dark:text-blue-400">Pricing</h2>
            <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
              Simple, transparent pricing
            </p>
            <p className="mt-6 text-lg leading-8 text-gray-600 dark:text-gray-300">
              Pay once for permanent storage. No subscriptions or hidden fees.
            </p>
          </div>
          <div className="mx-auto mt-12 max-w-2xl sm:mt-16 lg:mt-18 lg:max-w-4xl">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {pricingTiers.map((tier, index) => (
                <div 
                  key={index} 
                  className={`rounded-lg bg-blue-50 dark:bg-blue-900/30 p-6 text-center shadow-sm ring-1 ring-inset ring-blue-200 dark:ring-blue-800 hover-scale hover-glow transition-all duration-300 animate-fade-in-up delay-${index * 100}`}
                >
                  <h3 className="text-lg font-semibold leading-8 text-gray-900 dark:text-white">{tier.size}</h3>
                  <p className="mt-4 text-3xl font-bold tracking-tight text-gray-900 dark:text-white animate-pulse-subtle">{tier.price}</p>
                  <p className="mt-6 text-sm leading-6 text-gray-600 dark:text-gray-300">
                    One-time payment for permanent storage
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* CTA Section - Adjusted spacing */}
      <div className="py-16 sm:py-24 relative overflow-hidden">
        {/* Premium Background Pattern */}
        <div className="absolute inset-0 z-0 opacity-20 dark:opacity-30">
          <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="premiumGradient3" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#0f2027" />
                <stop offset="40%" stopColor="#2c5364" />
                <stop offset="100%" stopColor="#FFD700" stopOpacity="0.10" />
              </linearGradient>
              <radialGradient id="goldGlow3" cx="80%" cy="20%" r="70%">
                <stop offset="0%" stopColor="#FFD700" stopOpacity="0.20" />
                <stop offset="100%" stopColor="#2c5364" stopOpacity="0" />
              </radialGradient>
            </defs>
            <rect width="100%" height="100%" fill="url(#premiumGradient3)" />
            <circle cx="80%" cy="20%" r="180" fill="url(#goldGlow3)" />
          </svg>
        </div>
        <div className="mx-auto max-w-7xl px-6 lg:px-8 relative z-10">
          <div className="mx-auto max-w-2xl text-center animate-fade-in-up">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl animate-pulse-subtle">
              Ready to get started with TUMA?
            </h2>
            <p className="mt-6 text-lg leading-8 text-gray-600 dark:text-gray-300">
              Connect your wallet to start sending and receiving files securely.
            </p>
            <div className="flex items-center justify-center gap-x-6 bg-transparent dark:bg-transparent px-8 py-4 rounded-full shadow-none z-20 animate-float mt-10 border-none">
              <OnchainWallet />
              <button 
                onClick={() => navigate("/about")}
                className="text-sm font-semibold leading-6 bg-blue-50 dark:bg-blue-900/30 text-gray-900 dark:text-white px-4 py-2 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-800/50 transition-all flex items-center hover-glow"
                onMouseEnter={() => setIsHovering(true)}
                onMouseLeave={() => setIsHovering(false)}
              >
                Learn more <ArrowRight className={`ml-1 h-4 w-4 transition-transform ${isHovering ? 'translate-x-1' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="relative bg-gradient-to-b from-f8fafc to-e2e8f0 dark:from-gray-900 dark:to-gray-800 mt-0 overflow-hidden">
        {/* Premium Background Pattern */}
        <div className="absolute inset-0 z-0 opacity-20 dark:opacity-30">
          <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="premiumGradient4" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#0f2027" />
                <stop offset="40%" stopColor="#2c5364" />
                <stop offset="100%" stopColor="#FFD700" stopOpacity="0.10" />
              </linearGradient>
              <radialGradient id="goldGlow4" cx="80%" cy="20%" r="70%">
                <stop offset="0%" stopColor="#FFD700" stopOpacity="0.20" />
                <stop offset="100%" stopColor="#2c5364" stopOpacity="0" />
              </radialGradient>
              <linearGradient id="footerGrayGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#f8fafc" />
                <stop offset="100%" stopColor="#e2e8f0" />
              </linearGradient>
            </defs>
            <rect width="100%" height="100%" fill="url(#footerGrayGradient)" />
            <circle cx="80%" cy="20%" r="180" fill="url(#goldGlow4)" />
          </svg>
        </div>
        <div className="mx-auto max-w-7xl px-6 py-12 md:flex md:items-center md:justify-between lg:px-8 relative z-10" style={{borderRadius: '16px'}}>
          <div className="flex justify-center space-x-6 md:order-2">
            <a href="#" className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300">
              <span className="sr-only">Twitter</span>
              <svg className="h-6 w-6" fill="black" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84" />
              </svg>
            </a>
            <a href="#" className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300">
              <span className="sr-only">GitHub</span>
              <svg className="h-6 w-6" fill="black" viewBox="0 0 24 24" aria-hidden="true">
                <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
              </svg>
            </a>
          </div>
          <div className="mt-8 md:order-1 md:mt-0">
            <p className="text-center text-xs leading-5 text-gray-500 dark:text-gray-400">
              &copy; 2025 TUMA, Inc. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
