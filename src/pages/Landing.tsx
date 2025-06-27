import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowRight, CheckCircle, Shield, Wallet, Lock, Zap, Users, DollarSign, Star, Globe, CheckIcon, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { 
  Wallet as OnchainWallet, 
  ConnectWallet, 
  WalletDropdown, 
  WalletDropdownLink, 
  WalletDropdownFundLink, 
  WalletDropdownDisconnect 
} from '@coinbase/onchainkit/wallet';
import { useAccount } from 'wagmi';
import Header from "@/components/Header";

const Landing = () => {
  const navigate = useNavigate();
  const { address, isConnected } = useAccount();
  const [isHovering, setIsHovering] = useState(false);
  const [arweavePricing, setArweavePricing] = useState(null);
  const [isLoadingPricing, setIsLoadingPricing] = useState(true);
  const [showWalletModal, setShowWalletModal] = useState(false);

  // Calculate dynamic price with 7% profit margin
  const calculateDynamicPrice = useCallback((sizeInMB) => {
    if (!arweavePricing || !arweavePricing.pricePerMBInUSD) {
      return 'Loading...'; // Show loading state instead of artificial minimum
    }

    const basePrice = sizeInMB * arweavePricing.pricePerMBInUSD;
    const networkFactor = arweavePricing.networkFactor || 1;
    const adjustedPrice = basePrice * networkFactor;
    const finalPrice = adjustedPrice * 1.07; // 7% profit margin (reduced from 35%)

    // Pure real-time Arweave pricing without artificial minimums
    return finalPrice.toFixed(2);
  }, [arweavePricing]);
  
  // Calculate pricing variables using real-time data only
  const arPrice = arweavePricing ? (parseFloat(calculateDynamicPrice(1)) / (arweavePricing.pricePerARInUSD || 1)).toFixed(4) : 'Loading...';
  const usdPrice = arweavePricing ? `$${calculateDynamicPrice(1)} USDC` : 'Loading...';

  // Fetch Arweave pricing data
  const fetchArweavePricing = useCallback(async () => {
    try {
      const response = await fetch('/api/getArweavePrice');
      const data = await response.json();
      setArweavePricing(data);
    } catch (error) {
      console.error('Error fetching Arweave pricing:', error);
    } finally {
      setIsLoadingPricing(false);
    }
  }, []);

  useEffect(() => {
    fetchArweavePricing();
    // Refresh pricing every 5 seconds based on actual network conditions
    const interval = setInterval(fetchArweavePricing, 5 * 1000);
    return () => clearInterval(interval);
  }, [fetchArweavePricing]);

  // Calculate tier price for display
  const calculateTierPrice = useCallback((sizeInMB) => {
    if (isLoadingPricing) {
      return 'Loading...';
    }
    const price = calculateDynamicPrice(sizeInMB);
    return price === 'Loading...' ? price : `$${price} USDC`;
  }, [calculateDynamicPrice, isLoadingPricing]);

  const keyFeatures = [
    {
      icon: <Lock className="h-8 w-8 text-green-600" />,
      title: "🔒 True Data Ownership",
      description: "Your data belongs to you, not corporations",
      subtext: "Cryptographic security ensures only you control access"
    },
    {
      icon: <Zap className="h-8 w-8 text-blue-600" />,
      title: "⚡ Instant Wallet Sharing",
      description: "Share files instantly with just a wallet address",
      subtext: "No accounts, no emails, no friction"
    },
    {
      icon: <Shield className="h-8 w-8 text-purple-600" />,
      title: "🛡️ AI Shield Protection",
      description: "Protect your data from unauthorized AI training",
      subtext: "Built-in privacy protection against data harvesting"
    },
    {
      icon: <DollarSign className="h-8 w-8 text-green-600" />,
      title: "💰 One-Time Payment Model",
      description: "Pay once, store forever",
      subtext: "No monthly fees or surprise charges"
    }
  ];

  const comparisons = [
    {
      feature: "Payment Model",
      tuma: "One-time payment",
      traditional: "Monthly fees",
      others: "Complex setup"
    },
    {
      feature: "Data Control",
      tuma: "True ownership",
      traditional: "Platform controls",
      others: "Temporary storage"
    },
    {
      feature: "Storage Duration",
      tuma: "Permanent storage",
      traditional: "Can be deleted",
      others: "No AI protection"
    }
  ];

  const pricingTiers = [
    { size: "100KB", price: calculateTierPrice(10) },
    { size: "20MB", price: calculateTierPrice(35) },
    { size: "50MB", price: calculateTierPrice(75) },
    { size: "100MB+", price: "Real-time calculated" }
  ];

  // Scroll animation hook
  const useScrollAnimation = () => {
    const [visibleElements, setVisibleElements] = useState(new Set());
    const observerRef = useRef<IntersectionObserver | null>(null);

    useEffect(() => {
      observerRef.current = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              setVisibleElements(prev => new Set([...prev, entry.target.id]));
            }
          });
        },
        { threshold: 0.1, rootMargin: '50px' }
      );

      const elements = document.querySelectorAll('[data-scroll-animation]');
      elements.forEach(el => observerRef.current?.observe(el));

      return () => observerRef.current?.disconnect();
    }, []);

    return visibleElements;
  };

  const visibleElements = useScrollAnimation();

  const scrollStories = [
    {
      id: 'story-1',
      title: 'The Problem with Traditional Storage',
      content: 'Every year, millions of files are lost due to server failures, subscription cancellations, and platform shutdowns.',
      icon: <Shield className="h-12 w-12 text-red-500" />,
      stats: '73% of data is lost within 5 years'
    },
    {
      id: 'story-2', 
      title: 'The Tuma Solution',
      content: 'Permanent, decentralized storage that exists forever. Pay once, own forever.',
      icon: <Sparkles className="h-12 w-12 text-green-500" />,
      stats: '100% permanent guarantee'
    },
    {
      id: 'story-3',
      title: 'Your Data, Your Control',
      content: 'Complete privacy with instant sharing capabilities. No middlemen, no surveillance.',
      icon: <Lock className="h-12 w-12 text-blue-500" />,
      stats: 'Zero-knowledge architecture'
    }
  ];

  return (
    <div 
      className="min-h-screen relative"
      style={{
        backgroundImage: "url('/gray-background.png')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed'
      }}
    >
      {/* Glassmorphism Overlay */}
      <div className="absolute inset-0 bg-white/10 backdrop-blur-sm"></div>
      
      {/* Content Container */}
      <div className="relative z-10">
        {/* Header */}
        <Header />
        
        {/* Hero Section */}
        <div className="relative">
          {/* Hero Background Image */}
          <div className="w-full h-screen">
            <picture>
              {/* Mobile devices (up to 480px) */}
              <source 
                media="(max-width: 480px)" 
                srcSet="/hero-image-mobile.png" 
              />
              {/* Tablet devices (481px to 768px) */}
              <source 
                media="(max-width: 768px)" 
                srcSet="/hero-image-tablet.png" 
              />
              {/* Desktop devices (769px and up) */}
              <source 
                media="(min-width: 769px)" 
                srcSet="/main-hero.png" 
              />
              {/* Fallback image for browsers that don't support picture element */}
              <img 
                src="/hero-image.png"
                alt="Tuma - Store Forever, Pay Once"
                className="w-full h-full object-cover"
              />
            </picture>
          </div>
        </div>

        {/* Scrollytelling Section */}
        <div className="py-24 relative overflow-hidden">
          <div className="max-w-6xl mx-auto px-4">
            {scrollStories.map((story, index) => (
              <div 
                key={story.id}
                id={story.id}
                data-scroll-animation
                className={`min-h-screen flex items-center justify-center mb-16 ${
                  visibleElements.has(story.id) ? 'scroll-reveal revealed' : 'scroll-reveal'
                }`}
              >
                <div className="text-center max-w-4xl">
                  <div className={`mb-8 flex justify-center ${
                    visibleElements.has(story.id) ? 'scroll-scale visible stagger-1' : 'scroll-scale'
                  }`}>
                    {story.icon}
                  </div>
                  <h2 className={`text-5xl md:text-6xl font-bold text-gray-900 mb-6 ${
                    visibleElements.has(story.id) ? 'scroll-slide-left visible stagger-2' : 'scroll-slide-left'
                  }`}>
                    {story.title}
                  </h2>
                  <p className={`text-xl md:text-2xl text-gray-700 mb-8 leading-relaxed ${
                    visibleElements.has(story.id) ? 'scroll-slide-right visible stagger-3' : 'scroll-slide-right'
                  }`}>
                    {story.content}
                  </p>
                  <div className={`bg-white/30 backdrop-blur-md rounded-2xl p-6 inline-block border border-white/40 ${
                    visibleElements.has(story.id) ? 'scroll-fade-in visible stagger-4' : 'scroll-fade-in'
                  }`}>
                    <div className="text-3xl font-bold text-gray-900 mb-2">{story.stats}</div>
                    <div className="text-gray-600">Industry benchmark</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Hero Content Section */}
        <div className="py-12 bg-white/10 backdrop-blur-sm">
          <div className="max-w-4xl mx-auto text-center px-4">
            <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-12 border border-white/20 shadow-2xl">
              <h1 className="text-5xl md:text-7xl font-bold text-gray-900 mb-10">
                Store Forever, <span className="text-green-800">Pay Once</span>
              </h1>
              <div className="flex flex-col sm:flex-row gap-6 justify-center">
                {isConnected ? (
                  <button 
                    onClick={() => navigate('/send')}
                    className="bg-teal-700 hover:bg-teal-800 text-white px-10 py-5 rounded-xl font-bold text-xl transition-all duration-300 transform hover:scale-105 shadow-2xl border border-teal-600/50"
                  >
                    Start Storing Forever
                  </button>
                ) : (
                  <div className="relative">
                    <OnchainWallet>
                      <ConnectWallet className="bg-teal-700 hover:bg-teal-800 text-white px-10 py-5 rounded-xl font-bold text-xl transition-all duration-300 transform hover:scale-105 shadow-2xl border border-teal-600/50">
                        <span>Start Storing Forever</span>
                      </ConnectWallet>
                    </OnchainWallet>
                  </div>
                )}
                <button 
                  onClick={() => {
                    const element = document.getElementById('why-choose-tuma');
                    if (element) {
                      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                  }}
                  className="bg-white/20 backdrop-blur-md hover:bg-white/30 text-gray-900 px-10 py-5 rounded-xl font-bold text-xl transition-all duration-300 border border-white/40 shadow-xl"
                >
                  Learn More
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Enhanced Pricing Cards Section */}
        <div className="py-24 relative">
          <div className="max-w-7xl mx-auto px-4">
            <div 
              id="pricing-header"
              data-scroll-animation
              className={`text-center mb-16 ${
                visibleElements.has('pricing-header') ? 'scroll-reveal revealed' : 'scroll-reveal'
              }`}
            >
              <h2 className="text-5xl font-bold text-gray-900 mb-4">Revolutionary Pricing</h2>
              <p className="text-xl text-gray-700">The future of data storage pricing is here</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-16">
              {pricingTiers.map((tier, index) => (
                <div 
                  key={index}
                  id={`pricing-card-${index}`}
                  data-scroll-animation
                  className={`pricing-card bg-white/25 backdrop-blur-md rounded-3xl p-8 border border-white/30 text-center flex flex-col ${
                    visibleElements.has(`pricing-card-${index}`) ? `scroll-scale visible stagger-${index + 1}` : 'scroll-scale'
                  }`}
                >
                  <div className="text-2xl font-bold text-gray-900 mb-4">{tier.size}</div>
                  <div className="text-4xl font-bold text-green-600 mb-6">{tier.price}</div>
                  {tier.size !== "100MB+" ? (
                    <div className="space-y-3 text-gray-700 flex-grow">
                      <div className="flex items-center justify-center">
                        <CheckIcon className="h-5 w-5 text-green-600 mr-2" />
                        Permanent storage
                      </div>
                      <div className="flex items-center justify-center">
                        <CheckIcon className="h-5 w-5 text-green-600 mr-2" />
                        Instant sharing
                      </div>
                      <div className="flex items-center justify-center">
                        <CheckIcon className="h-5 w-5 text-green-600 mr-2" />
                        Zero fees
                      </div>
                    </div>
                  ) : (
                    <div className="text-gray-700 mb-6 flex-grow flex items-center justify-center">
                      <p className="text-lg font-medium">Start storing your data permanently today</p>
                    </div>
                  )}
                  <button 
                    onClick={() => navigate('/send')}
                    className="mt-auto w-full bg-gray-800 hover:bg-gray-900 text-white px-6 py-3 rounded-xl font-semibold transition-all duration-300 transform hover:scale-105"
                  >
                    Get Started
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Key Features Section */}
        <div className="py-16">
          <div className="max-w-7xl mx-auto px-4">
            {/* Social Proof */}
            <div className="text-center mb-16">
              <div className="bg-white/20 backdrop-blur-md rounded-2xl p-6 inline-block border border-white/30">
                <p className="text-lg font-semibold text-gray-800 mb-2">
                  <span className="text-green-600">Join 1000+ users</span> storing data permanently
                </p>
                <p className="text-gray-700">Trusted by privacy-conscious individuals and businesses</p>
                <div className="flex justify-center mt-4 space-x-1">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-5 w-5 text-yellow-500 fill-current" />
                  ))}
                </div>
              </div>
            </div>

            {/* Key Features Grid */}
            <div id="why-choose-tuma" className="text-center mb-12">
              <h2 className="text-4xl font-bold text-gray-900 mb-4">Why Choose Tuma?</h2>
              <p className="text-xl text-gray-700">Four core benefits that set us apart</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-16">
              {keyFeatures.map((feature, index) => (
                <div 
                  key={index}
                  className="bg-white/25 backdrop-blur-md rounded-2xl p-6 border border-white/30 hover:bg-white/35 transition-all duration-300 transform hover:scale-105"
                >
                  <div className="flex justify-center mb-4">
                    {feature.icon}
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-3 text-center">
                    {feature.title}
                  </h3>
                  <p className="text-gray-800 font-semibold text-center mb-2">
                    {feature.description}
                  </p>
                  <p className="text-gray-600 text-sm text-center">
                    {feature.subtext}
                  </p>
                </div>
              ))}
            </div>

            {/* Comparison Table */}
            <div className="bg-white/20 backdrop-blur-md rounded-3xl p-8 border border-white/30">
              <h3 className="text-3xl font-bold text-gray-900 text-center mb-8">How We Compare</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-300">
                      <th className="text-left py-4 px-4 font-semibold text-gray-900">Feature</th>
                      <th className="text-center py-4 px-4 font-semibold text-green-600">Tuma</th>
                      <th className="text-center py-4 px-4 font-semibold text-gray-600">Traditional Cloud</th>
                      <th className="text-center py-4 px-4 font-semibold text-gray-600">Other Decentralized</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisons.map((comparison, index) => (
                      <tr key={index} className="border-b border-gray-200">
                        <td className="py-4 px-4 font-medium text-gray-900">{comparison.feature}</td>
                        <td className="py-4 px-4 text-center">
                          <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-semibold">
                            {comparison.tuma}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-center text-gray-600">{comparison.traditional}</td>
                        <td className="py-4 px-4 text-center text-gray-600">{comparison.others}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Call to Action Section */}
        <div className="py-16">
          <div className="max-w-4xl mx-auto text-center px-4">
            <div className="bg-white/25 backdrop-blur-md rounded-3xl p-12 border border-white/30 hover:bg-white/35 transition-all duration-300">
              <h2 className="text-4xl font-bold text-gray-900 mb-4">
                Ready to Own Your Data Forever?
              </h2>
              <p className="text-xl text-gray-700 mb-8">
                Join thousands of users who have taken control of their data
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button 
                  onClick={() => navigate('/about')}
                  className="bg-white/30 backdrop-blur-md hover:bg-white/40 text-gray-900 px-10 py-4 rounded-xl font-bold text-xl transition-all duration-300 border border-white/50"
                >
                  Contact Us
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
    </div>
  );
};

export default Landing;
