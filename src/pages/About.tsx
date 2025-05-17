import { CheckCircle, MessageSquare, Shield, Users } from "lucide-react";
import Header from "@/components/Header";

const About = () => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-blue-50 dark:from-[#191919] dark:to-[#191919] page-transition">
      <Header />
      
      <main className="pt-28 px-6 pb-16 max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight dark:text-white">About Tuma</h1>
          <p className="text-lg text-doc-medium-gray dark:text-gray-300 max-w-2xl mx-auto">
  Share your files with anyone, store them permanently, and pay only once. Enjoy unlimited sharing and complete peace of mind with Tuma.
</p>
        </div>
        
        <div className="grid md:grid-cols-2 gap-16 items-center mb-24">
          <div className="order-2 md:order-1">
            <span className="inline-block text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-300 px-2.5 py-0.5 rounded-full mb-3">
              Our Mission
            </span>
            <h2 className="text-3xl font-bold mb-4 dark:text-white">Experience Effortless, Secure File Sharing</h2>
<p className="text-doc-medium-gray dark:text-gray-300 mb-6">
  Imagine sending your most important Filesfamily memories, business contracts, creative workto anyone, anywhere, with zero hassle. With Tuma, your files are safe, accessible, and unalterable for generations. Once your files are stored, they can never be deleted, never lost, and are always within reach. And you pay only once. No monthly payments, no subscriptions, no hidden fees. Just a single, simple payment for a lifetime of true digital freedom and peace of mind.
</p>
<p className="text-doc-medium-gray dark:text-gray-300 mb-6">
  This is more than storage; this is your legacy, shared and secured forever. Tuma is born from a passion for seamless connection and engineered by visionaries who believe sharing Files should be as inspiring as the work you create. With end-to-end encryption, intuitive flows, and an unwavering focus on your experience, we transform every File into a moment of possibility and inspiration.
</p>
            <div className="mt-8 space-y-4">
              <div className="flex items-start">
                <CheckCircle size={20} className="text-green-500 dark:text-green-400 mt-1 mr-3 flex-shrink-0" />
                <p>
                  <span className="font-medium dark:text-white">End-to-end encryption</span>
                  <span className="block text-sm text-doc-medium-gray dark:text-gray-300">Your files are never accessible to unauthorized parties</span>
                </p>
              </div>
              <div className="flex items-start">
                <CheckCircle size={20} className="text-green-500 dark:text-green-400 mt-1 mr-3 flex-shrink-0" />
                <p>
                  <span className="font-medium dark:text-white">Seamless integration</span>
                  <span className="block text-sm text-doc-medium-gray dark:text-gray-300">Share files directly in your browser without complex setup</span>
                </p>
              </div>
              <div className="flex items-start">
                <CheckCircle size={20} className="text-green-500 dark:text-green-400 mt-1 mr-3 flex-shrink-0" />
                <p>
                  <span className="font-medium dark:text-white">Privacy-first approach</span>
                  <span className="block text-sm text-doc-medium-gray dark:text-gray-300">We don't store or analyze the content of your files</span>
                </p>
              </div>
            </div>
          </div>
          
          <div className="order-1 md:order-2">
            <div className="glass-panel p-8 rounded-2xl animate-float">
              <div className="aspect-square bg-white flex items-center justify-center rounded-xl">
                <img src="/tuma%20logo.png" alt="TUMA Logo" className="max-w-[80%] max-h-[80%] object-contain" />
              </div>
            </div>
          </div>
        </div>
        
        <div className="mb-24">
          <div className="text-center mb-12">
            <span className="inline-block text-xs font-medium bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-300 px-2.5 py-0.5 rounded-full mb-3">
              Why Choose Us
            </span>
            <h2 className="text-3xl font-bold mb-4 dark:text-white">The Tuma Advantage</h2>
            <p className="text-doc-medium-gray dark:text-gray-300 max-w-2xl mx-auto">
              Our platform offers unique benefits that make <span className="font-semibold text-doc-deep-blue dark:text-blue-200">file sharing</span> easier and more secure than ever before.
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard 
              icon={<Shield size={28} className="text-blue-600 dark:text-blue-400" />}
              title="Enterprise-Grade Security"
              description="Military-grade encryption protocols and secure key management ensure your sensitive documents remain protected."
            />
            
            <FeatureCard 
              icon={<Users size={28} className="text-green-600 dark:text-green-400" />}
              title="Effortless Collaboration"
              description="Share documents with individuals or teams without requiring recipients to create accounts or install software."
            />
            
            <FeatureCard 
              icon={<MessageSquare size={28} className="text-purple-600 dark:text-purple-400" />}
              title="Permanent Storage on Arweave"
              description="Your files are stored forever on Arweaveimmutable, decentralized, and always accessible. No risk of deletion or loss."
            />
          </div>
        </div>
        
        <div className="glass-panel p-8 md:p-12 text-center">
          <h2 className="text-2xl md:text-3xl font-bold mb-4 dark:text-white">Ready to Transform Your File Sharing?</h2>
          <p className="text-doc-medium-gray dark:text-gray-300 mb-8 max-w-2xl mx-auto">
            Join thousands of professionals who trust Tuma for their file sharing needs.
          </p>
          <button className="px-8 py-3 bg-doc-deep-blue text-white rounded-lg hover:bg-blue-600 transition-colors font-medium">
  Coming Soon
</button>
        </div>
      </main>
      
      <footer className="bg-gray-50 dark:bg-gray-900 py-12 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="mb-6 md:mb-0">
              <span className="text-xl font-bold bg-gradient-to-r from-doc-deep-blue to-blue-500 bg-clip-text text-transparent">
                Tuma
              </span>
              <p className="text-sm text-doc-medium-gray dark:text-gray-300 mt-2">Secure file sharing made simple</p>
            </div>
            
            <div className="flex flex-wrap justify-center gap-6">
              <a href="#" className="text-doc-medium-gray hover:text-doc-deep-blue dark:text-gray-400 dark:hover:text-blue-400 transition-colors">Privacy Policy</a>
              <a href="#" className="text-doc-medium-gray hover:text-doc-deep-blue dark:text-gray-400 dark:hover:text-blue-400 transition-colors">Terms of Service</a>
              <a href="#" className="text-doc-medium-gray hover:text-doc-deep-blue dark:text-gray-400 dark:hover:text-blue-400 transition-colors">Contact</a>
              <a href="#" className="text-doc-medium-gray hover:text-doc-deep-blue dark:text-gray-400 dark:hover:text-blue-400 transition-colors">FAQ</a>
            </div>
          </div>
          
          <div className="mt-8 pt-8 border-t border-gray-200 dark:border-gray-700 text-center text-sm text-doc-medium-gray dark:text-gray-400">
            &copy; {new Date().getFullYear()} Tuma. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const FeatureCard = ({ icon, title, description }: FeatureCardProps) => {
  return (
    <div className="glass-panel p-6 rounded-xl card-hover">
      <div className="w-14 h-14 rounded-full bg-doc-soft-blue dark:bg-blue-900 flex items-center justify-center mb-4">
        {icon}
      </div>
      <h3 className="text-xl font-bold mb-2 dark:text-white">{title}</h3>
      <p className="text-doc-medium-gray dark:text-gray-300">{description}</p>
    </div>
  );
};

export default About;
