import { Users, Target, Award, Network, ShieldCheck, Bolt, ArrowRight, Building, Mail, Phone, Sparkles, Lock, Database, Clock, CheckCircle } from "lucide-react";
import Header from "@/components/Header";

const About = () => {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header />
      
      {/* Enhanced Hero Section */}
      <section className="relative pt-40 pb-40 overflow-hidden">
        {/* Animated Background */}
        <div className="absolute inset-0" style={{backgroundImage: 'url("/gray-background.png")', backgroundSize: 'cover', backgroundPosition: 'center'}}>
          <div className="absolute inset-0 bg-black/20"></div>
        </div>
        
        <div className="relative max-w-7xl mx-auto px-6">
          <div className="text-center">

            
            {/* Main Title */}
            <h1 className="text-6xl md:text-8xl font-bold mb-8 text-black">
              About <span className="text-teal-700">Tuma</span>
            </h1>
            
            {/* Subtitle */}
            <div className="text-xl md:text-2xl text-black max-w-3xl mx-auto leading-relaxed mb-12 font-light">
              <p className="text-black">Permanent, secure, decentralized storage solutions for the modern world.</p>
            </div>
            
            {/* Key Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-4xl mx-auto">
              <div className="bg-gray-200/20 backdrop-blur-md border border-gray-300/30 rounded-2xl p-6 hover:bg-gray-200/30 transition-all duration-300">
                <div className="text-3xl font-bold text-teal-700 mb-2">∞</div>
                <div className="text-gray-700 text-sm font-medium">Permanent</div>
              </div>
              <div className="bg-gray-200/20 backdrop-blur-md border border-gray-300/30 rounded-2xl p-6 hover:bg-gray-200/30 transition-all duration-300">
                <div className="text-3xl font-bold text-teal-700 mb-2">256</div>
                <div className="text-gray-700 text-sm font-medium">Encrypted</div>
              </div>
              <div className="bg-gray-200/20 backdrop-blur-md border border-gray-300/30 rounded-2xl p-6 hover:bg-gray-200/30 transition-all duration-300">
                <div className="text-3xl font-bold text-teal-700 mb-2">0</div>
                <div className="text-gray-700 text-sm font-medium">Monthly Fees</div>
              </div>
              <div className="bg-gray-200/20 backdrop-blur-md border border-gray-300/30 rounded-2xl p-6 hover:bg-gray-200/30 transition-all duration-300">
                <div className="text-3xl font-bold text-teal-700 mb-2">24/7</div>
                <div className="text-gray-700 text-sm font-medium">Access</div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Scroll Indicator */}
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 animate-bounce">
          <div className="w-6 h-10 border-2 border-black/50 rounded-full flex justify-center">
            <div className="w-1 h-3 bg-black/80 rounded-full mt-2 animate-pulse"></div>
          </div>
        </div>
      </section>

      {/* What We Do Section */}
      <section className="py-20 bg-white dark:bg-gray-800">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
              What We Do
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
              Tuma provides a revolutionary file sharing platform that combines the security of blockchain technology with the simplicity of modern web applications.
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-gray-50 dark:bg-gray-700 p-8 rounded-xl">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900 rounded-xl flex items-center justify-center mb-6">
                <ShieldCheck className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                Secure File Storage
              </h3>
              <p className="text-gray-600 dark:text-gray-300">
                Your files are encrypted end-to-end and stored permanently on the Arweave blockchain, ensuring they can never be lost or compromised.
              </p>
            </div>
            
            <div className="bg-gray-50 dark:bg-gray-700 p-8 rounded-xl">
              <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-xl flex items-center justify-center mb-6">
                <Network className="w-8 h-8 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                Global Accessibility
              </h3>
              <p className="text-gray-600 dark:text-gray-300">
                Share files with anyone, anywhere in the world. Recipients don't need accounts or special software to access your shared content.
              </p>
            </div>
            
            <div className="bg-gray-50 dark:bg-gray-700 p-8 rounded-xl">
              <div className="w-16 h-16 bg-purple-100 dark:bg-purple-900 rounded-xl flex items-center justify-center mb-6">
                <Bolt className="w-8 h-8 text-purple-600 dark:text-purple-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                One-Time Payment
              </h3>
              <p className="text-gray-600 dark:text-gray-300">
                Pay once and store forever. No monthly subscriptions, no hidden fees. Your files remain accessible for generations.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Our Mission Section */}
      <section className="py-20 bg-gray-100 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-6">
                Our Mission
              </h2>
              <p className="text-lg text-gray-600 dark:text-gray-300 mb-6">
                At Tuma, we believe that file sharing should be simple, secure, and permanent. We're building the future of digital storage where your important documents, memories, and creative work are preserved forever without the worry of data loss or recurring costs.
              </p>
              <p className="text-lg text-gray-600 dark:text-gray-300 mb-8">
                Our platform leverages cutting-edge blockchain technology to ensure that once your files are stored, they become part of an immutable, decentralized network that will outlast any single company or service.
              </p>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center">
                  <Target className="w-6 h-6 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white">Vision</h4>
                  <p className="text-gray-600 dark:text-gray-300">A world where digital preservation is permanent and accessible to everyone</p>
                </div>
              </div>
            </div>
            
            <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-lg">
              <div className="grid grid-cols-2 gap-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-green-600 dark:text-green-400 mb-2">200+</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Years of Storage</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-600 dark:text-blue-400 mb-2">99.9%</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Uptime Guarantee</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-purple-600 dark:text-purple-400 mb-2">∞</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">File Shares</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-orange-600 dark:text-orange-400 mb-2">0</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Monthly Fees</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Our Team Section */}
      <section className="py-20 bg-white dark:bg-gray-800">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Meet Our Team
            </h2>

          </div>
          
          <div className="flex justify-center">
            <div className="text-center max-w-5xl">
              <div className="w-32 h-32 rounded-full mx-auto mb-6 flex items-center justify-center overflow-hidden bg-white border-4 border-blue-200">
                <img 
                  src="/Base logo.png" 
                  alt="Base Zambia Logo" 
                  className="w-full h-full object-contain"
                />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                Base Zambia
              </h3>
              <p className="text-gray-600 dark:text-gray-300 text-sm max-w-4xl mx-auto px-8">
                Base Zambia builds and grows the blockchain community in Zambia and Southern Africa. Winners of Onchain Summer 2 and alumni of Incubase 001, we bring Zambia onchain through education and innovation.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Company Values Section */}
      <section className="py-20 bg-gray-100 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Our Values
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
              The principles that guide everything we do at Tuma.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900 rounded-xl flex items-center justify-center mx-auto mb-4">
                <ShieldCheck className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                Security First
              </h3>
              <p className="text-gray-600 dark:text-gray-300 text-sm">
                Your data security and privacy are our top priorities in every decision we make.
              </p>
            </div>
            
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Users className="w-8 h-8 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                User-Centric
              </h3>
              <p className="text-gray-600 dark:text-gray-300 text-sm">
                We design every feature with our users' needs and experiences at the center.
              </p>
            </div>
            
            <div className="text-center">
              <div className="w-16 h-16 bg-purple-100 dark:bg-purple-900 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Award className="w-8 h-8 text-purple-600 dark:text-purple-400" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                Excellence
              </h3>
              <p className="text-gray-600 dark:text-gray-300 text-sm">
                We strive for excellence in every aspect of our platform and service.
              </p>
            </div>
            
            <div className="text-center">
              <div className="w-16 h-16 bg-orange-100 dark:bg-orange-900 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Network className="w-8 h-8 text-orange-600 dark:text-orange-400" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                Accessibility
              </h3>
              <p className="text-gray-600 dark:text-gray-300 text-sm">
                Making advanced technology accessible and usable for everyone, everywhere.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section className="py-20 bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-16">
            <div>
              <h2 className="text-4xl font-bold mb-6">
                Get in Touch
              </h2>
              <p className="text-xl text-gray-600 dark:text-gray-300 mb-8">
                Have questions about Tuma? Want to learn more about our technology? We'd love to hear from you.
              </p>
              
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-green-600 rounded-lg flex items-center justify-center">
                    <Mail className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-semibold">Email</h4>
                    <p className="text-gray-600 dark:text-gray-300">tumaapp@gmail.com</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center">
                    <Building className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-semibold">Office</h4>
                    <p className="text-gray-600 dark:text-gray-300">onchain</p>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-lg">
              <h3 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">Ready to Get Started?</h3>
              <p className="text-gray-600 dark:text-gray-300 mb-8">
                Join the future of file sharing and storage. Experience the security and permanence of blockchain-based file storage.
              </p>
              <button className="w-full bg-teal-700 hover:bg-teal-800 text-white font-semibold py-4 px-6 rounded-xl transition-colors flex items-center justify-center gap-2">
                Coming Soon
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default About;
