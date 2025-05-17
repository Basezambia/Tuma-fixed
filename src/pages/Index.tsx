
import { ArrowRight, BarChart2, HardDrive, Send, Users } from "lucide-react";
import { Link } from "react-router-dom";
import Header from "@/components/Header";

const Dashboard = () => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-blue-50 dark:from-gray-900 dark:to-gray-800 page-transition">
      <Header />
      
      <main className="pt-28 px-6 pb-16 max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold mb-3 tracking-tight dark:text-white">Seamless Document Exchange</h1>
          <p className="text-lg text-doc-medium-gray dark:text-gray-400 max-w-2xl mx-auto">
            Share documents securely. Connect, send, and manage all your documents in one place with TUMA.
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-12">
          <StatCard 
            title="Documents Received" 
            value="42" 
            icon={<HardDrive className="text-blue-500" />} 
            trend="+12% from last week"
            to="/documents"
          />
          
          <StatCard 
            title="Documents Sent" 
            value="17" 
            icon={<Send className="text-green-500" />} 
            trend="+5% from last week"
            to="/documents"
          />
          
          <StatCard 
            title="Connected Users" 
            value="8" 
            icon={<Users className="text-purple-500" />} 
            trend="2 new connections"
            to="/profile"
          />
          
          <StatCard 
            title="Activity" 
            value="High" 
            icon={<BarChart2 className="text-amber-500" />} 
            trend="Active today"
            to="/profile"
          />
        </div>
        
        <div className="mt-16 grid md:grid-cols-2 gap-8">
          <div className="glass-panel p-8 card-hover">
            <div className="flex items-start justify-between">
              <div>
                <span className="inline-block text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300 px-2.5 py-0.5 rounded-full mb-3">
                  Quick Action
                </span>
                <h2 className="text-2xl font-bold mb-3 dark:text-white">Send a Document</h2>
                <p className="text-doc-medium-gray dark:text-gray-400 mb-6">
                  Quickly send documents to your contacts with end-to-end encryption and delivery confirmation.
                </p>
                <Link to="/send" className="inline-flex items-center text-doc-deep-blue dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium">
                  Send now <ArrowRight size={16} className="ml-1" />
                </Link>
              </div>
              <div className="hidden md:block">
                <div className="w-16 h-16 rounded-2xl bg-doc-soft-blue dark:bg-blue-900 flex items-center justify-center">
                  <Send size={32} className="text-doc-deep-blue dark:text-blue-400" />
                </div>
              </div>
            </div>
          </div>
          
          <div className="glass-panel p-8 card-hover">
            <div className="flex items-start justify-between">
              <div>
                <span className="inline-block text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300 px-2.5 py-0.5 rounded-full mb-3">
                  Management
                </span>
                <h2 className="text-2xl font-bold mb-3 dark:text-white">View Documents</h2>
                <p className="text-doc-medium-gray dark:text-gray-400 mb-6">
                  Browse, organize and manage all your sent and received documents in one intuitive interface.
                </p>
                <Link to="/documents" className="inline-flex items-center text-doc-deep-blue dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium">
                  View documents <ArrowRight size={16} className="ml-1" />
                </Link>
              </div>
              <div className="hidden md:block">
                <div className="w-16 h-16 rounded-2xl bg-doc-soft-blue dark:bg-blue-900 flex items-center justify-center">
                  <HardDrive size={32} className="text-doc-deep-blue dark:text-blue-400" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

interface StatCardProps {
  title: string;
  value: string;
  icon: React.ReactNode;
  trend: string;
  to: string;
}

const StatCard = ({ title, value, icon, trend, to }: StatCardProps) => {
  return (
    <Link to={to} className="glass-panel p-6 card-hover">
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-doc-medium-gray dark:text-gray-400 font-medium">{title}</h3>
        {icon}
      </div>
      <div className="mt-2">
        <p className="text-3xl font-bold dark:text-white">{value}</p>
        <p className="text-xs text-doc-medium-gray dark:text-gray-500 mt-1">{trend}</p>
      </div>
    </Link>
  );
};

export default Dashboard;
