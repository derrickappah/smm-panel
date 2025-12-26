import React, { useState, useEffect, useRef } from 'react';
import { SupportProvider, useSupport } from '@/contexts/support-context';
import { AdminSupportChat } from '@/components/support/admin/AdminSupportChat';
import { TicketsList } from '@/components/support/admin/TicketsList';

const AdminSupportContent = () => {
  const {
    tickets,
    currentTicket,
    loadAllTickets,
    loadMoreTickets,
    selectTicket,
    hasMoreTickets,
    isLoadingMoreTickets,
  } = useSupport();

  // Ensure tickets is always an array
  const safeTickets = Array.isArray(tickets) ? tickets : [];

  const [filters, setFilters] = useState({
    status: 'all',
    category: 'all',
    search: '',
  });
  const [mobileView, setMobileView] = useState('list');
  const userNavigatedBackRef = useRef(false);

  useEffect(() => {
    loadAllTickets();
  }, [loadAllTickets]);

  // If no ticket selected and we're in chat view on mobile, go back to list
  useEffect(() => {
    if (!currentTicket && mobileView === 'chat') {
      const isMobile = window.matchMedia('(max-width: 767px)').matches;
      if (isMobile) {
        setMobileView('list');
        userNavigatedBackRef.current = false;
      }
    }
  }, [currentTicket, mobileView]);

  const handleSelectTicket = (ticketId) => {
    selectTicket(ticketId);
    // On mobile, switch to chat view when a ticket is selected
    const isMobile = window.matchMedia('(max-width: 767px)').matches;
    if (isMobile) {
      setMobileView('chat');
      userNavigatedBackRef.current = false;
    }
  };

  const handleBackToList = () => {
    const isMobile = window.matchMedia('(max-width: 767px)').matches;
    if (isMobile) {
      setMobileView('list');
      userNavigatedBackRef.current = true;
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm w-full max-w-full overflow-hidden flex flex-col h-[calc(100vh-3rem)]">
      {/* Mobile View - Toggle between list and chat */}
      <div className="md:hidden flex flex-1 min-h-0">
        {mobileView === 'list' ? (
          <div className="w-full flex flex-col bg-white">
            <div className="p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold">Tickets</h2>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              <TicketsList
                tickets={safeTickets}
                currentTicketId={currentTicket?.id || null}
                onSelectTicket={handleSelectTicket}
                filters={filters}
                hasMoreTickets={hasMoreTickets}
                isLoadingMoreTickets={isLoadingMoreTickets}
                onLoadMore={loadMoreTickets}
              />
            </div>
          </div>
        ) : (
          <div className="w-full flex flex-col overflow-hidden min-h-0">
            <AdminSupportChat onBackToList={handleBackToList} />
          </div>
        )}
      </div>

      {/* Desktop View - Side-by-side layout */}
      <div className="hidden md:flex flex-1 min-h-0">
        {/* Sidebar - Tickets List */}
        <div className="md:w-80 border-r border-gray-200 flex flex-col bg-white">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold">Tickets</h2>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <TicketsList
              tickets={safeTickets}
              currentTicketId={currentTicket?.id || null}
              onSelectTicket={selectTicket}
              filters={filters}
              hasMoreTickets={hasMoreTickets}
              isLoadingMoreTickets={isLoadingMoreTickets}
              onLoadMore={loadMoreTickets}
            />
          </div>
        </div>

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          <AdminSupportChat />
        </div>
      </div>
    </div>
  );
};

const AdminSupport = () => {
  return (
    <SupportProvider>
      <AdminSupportContent />
    </SupportProvider>
  );
};

export default AdminSupport;

