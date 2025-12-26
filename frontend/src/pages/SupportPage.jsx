import React, { useState } from 'react';
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
    tickets, 
    currentTicket, 
    isLoadingTickets, 
    loadTickets,
    selectTicket 
  } = useSupport();
  const [activeTab, setActiveTab] = useState('new');

  React.useEffect(() => {
    loadTickets();
  }, [loadTickets]);

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
            <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center">
              <MessageSquare className="w-8 h-8 text-purple-600" />
            </div>
          </div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2 sm:mb-4">
            Support Center
          </h1>
          <p className="text-sm sm:text-base lg:text-lg text-gray-600 max-w-2xl mx-auto">
            Create a ticket to get help with your orders and account issues.
          </p>
        </div>

        {/* Tab Buttons */}
        <div className="flex gap-4 mb-4">
          <Button
            onClick={() => setActiveTab('new')}
            className={`flex-1 ${
              activeTab === 'new'
                ? 'bg-purple-600 hover:bg-purple-700 text-white'
                : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
            }`}
          >
            <FileText className="w-4 h-4 mr-2" />
            New Ticket
          </Button>
          <Button
            onClick={() => setActiveTab('history')}
            className={`flex-1 ${
              activeTab === 'history'
                ? 'bg-purple-600 hover:bg-purple-700 text-white'
                : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
            }`}
          >
            <History className="w-4 h-4 mr-2" />
            Ticket History
          </Button>
        </div>

        {/* Main Content Area */}
        {activeTab === 'new' ? (
          <Card className="min-h-[600px]">
            <CardContent className="p-0 h-full">
              <TicketForm />
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Ticket List */}
            <Card className="lg:col-span-1 h-[600px]">
              <CardContent className="p-0 h-full">
                {isLoadingTickets ? (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-gray-500">Loading tickets...</p>
                  </div>
                ) : (
                  <TicketList
                    tickets={Array.isArray(tickets) ? tickets : []}
                    currentTicketId={currentTicket?.id || null}
                    onSelectTicket={selectTicket}
                  />
                )}
              </CardContent>
            </Card>

            {/* Chat Area */}
            <Card className="lg:col-span-2 h-[600px]">
              <CardContent className="p-0 h-full">
                <SupportChat />
              </CardContent>
            </Card>
          </div>
        )}
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
