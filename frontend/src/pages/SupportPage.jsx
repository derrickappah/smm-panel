import React, { useEffect } from 'react';
import { SupportProvider, useSupport } from '@/contexts/support-context';
import { SupportChat } from '@/components/support/SupportChat';
import Navbar from '@/components/Navbar';
import SEO from '@/components/SEO';
import { Card, CardContent } from '@/components/ui/card';
import { MessageSquare } from 'lucide-react';

const SupportPageContent = ({ user, onLogout }) => {
  const { currentConversation, conversations, isLoadingConversations, getOrCreateConversation } = useSupport();

  useEffect(() => {
    // Ensure conversation is created/selected when page loads
    // The context handles auto-selection, but we ensure it's triggered here too
    if (!isLoadingConversations && !currentConversation) {
      getOrCreateConversation();
    }
  }, [isLoadingConversations, currentConversation, getOrCreateConversation]);

  return (
    <div className="min-h-screen bg-gray-50">
      <SEO
        title="Support Center - Help & FAQ | BoostUp GH"
        description="Get help with your BoostUp GH account, orders, payments, and more. Contact our 24/7 support team for assistance."
        keywords={['support', 'help', 'customer service', 'contact']}
        canonical="/support"
      />
      <Navbar user={user} onLogout={onLogout} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 md:pt-6 pb-6 sm:pb-8 lg:pb-12">
        {/* Hero Header */}
        <div className="text-center mb-6 sm:mb-8 lg:mb-12 animate-fadeIn">
          <div className="flex items-center justify-center mb-4">
            <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center">
              <MessageSquare className="w-8 h-8 text-indigo-600" />
            </div>
          </div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2 sm:mb-4">
            Support Center
          </h1>
          <p className="text-sm sm:text-base lg:text-lg text-gray-600 max-w-2xl mx-auto">
            We're here to help! Chat with our support team for immediate assistance.
          </p>
        </div>

        {/* Main Chat Area */}
        <Card className="h-[600px] sm:h-[700px]">
          <CardContent className="p-0 h-full">
            <SupportChat />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

const SupportPage = ({ user, onLogout }) => {
  return (
    <SupportProvider>
      <SupportPageContent user={user} onLogout={onLogout} />
    </SupportProvider>
  );
};

export default SupportPage;
