import React, { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { SupportProvider, useSupport } from '@/contexts/support-context';
import { SupportChat } from '@/components/support/SupportChat';
import { TicketForm } from '@/components/support/TicketForm';
import { TicketList } from '@/components/support/TicketList';
import Navbar from '@/components/Navbar';
import SEO from '@/components/SEO';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MessageSquare, FileText, History } from 'lucide-react';

const SupportPageContent = ({ user, onLogout }) => {
  const {
    currentConversation,
    getOrCreateConversation,
    isLoadingConversations,
    selectConversation
  } = useSupport();

  // Automatically get or create conversation on mount
  React.useEffect(() => {
    const initChat = async () => {
      const conv = await getOrCreateConversation();
      if (conv) {
        selectConversation(conv.id);
      }
    };
    initChat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getOrCreateConversation]);

  return (
    <div className="flex flex-col h-screen bg-[#f0f2f5] overflow-hidden">
      <SEO
        title="Support Center - Live Chat | BoostUp GH"
        description="Chat with our 24/7 support team for assistance with your account, orders, and more."
        keywords={['support', 'help', 'live chat', 'contact']}
        canonical="/support"
      />
      <Helmet>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0" />
      </Helmet>
      <div className="flex-shrink-0">
        <Navbar user={user} onLogout={onLogout} />
      </div>

      <main className="flex-1 w-full min-h-0 overflow-hidden">
        <Card className="h-full shadow-none border-none overflow-hidden rounded-none bg-transparent">
          <CardContent className="p-0 h-full">
            <SupportChat />
          </CardContent>
        </Card>
      </main>
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
