import React, { useState, useEffect, useRef } from 'react';
import { SupportProvider, useSupport } from '@/contexts/support-context';
import { AdminSupportChat } from '@/components/support/admin/AdminSupportChat';
import { ConversationsList } from '@/components/support/admin/ConversationsList';
import { ConversationSearch } from '@/components/support/admin/ConversationSearch';

const AdminSupportContent = () => {
  const {
    conversations,
    currentConversation,
    loadAllConversations,
    loadMoreConversations,
    selectConversation,
    setPriority,
    assignConversation,
    addTag,
    removeTag,
    updateConversationStatus,
    hasMoreConversations,
    isLoadingMoreConversations,
  } = useSupport();

  // Ensure conversations is always an array
  const safeConversations = Array.isArray(conversations) ? conversations : [];

  const [filters, setFilters] = useState({});
  const [mobileView, setMobileView] = useState('list');
  const userNavigatedBackRef = useRef(false);

  useEffect(() => {
    loadAllConversations();
  }, [loadAllConversations]);

  // If no conversation selected and we're in chat view on mobile, go back to list
  useEffect(() => {
    if (!currentConversation && mobileView === 'chat') {
      const isMobile = window.matchMedia('(max-width: 767px)').matches;
      if (isMobile) {
        setMobileView('list');
        userNavigatedBackRef.current = false;
      }
    }
  }, [currentConversation, mobileView]);

  const handleSelectConversation = (conversationId: string) => {
    selectConversation(conversationId);
    // On mobile, switch to chat view when a conversation is selected
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
              <h2 className="text-lg font-semibold">Conversations</h2>
            </div>
            <ConversationSearch filters={filters} onFiltersChange={setFilters} />
            <div className="flex-1 min-h-0 overflow-hidden">
              <ConversationsList
                conversations={safeConversations}
                currentConversationId={currentConversation?.id || null}
                onSelectConversation={handleSelectConversation}
                filters={filters}
                hasMoreConversations={hasMoreConversations}
                isLoadingMoreConversations={isLoadingMoreConversations}
                onLoadMore={loadMoreConversations}
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
        {/* Sidebar - Conversations List */}
        <div className="md:w-80 border-r border-gray-200 flex flex-col bg-white">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold">Conversations</h2>
          </div>
          <ConversationSearch filters={filters} onFiltersChange={setFilters} />
          <div className="flex-1 min-h-0 overflow-hidden">
            <ConversationsList
              conversations={safeConversations}
              currentConversationId={currentConversation?.id || null}
              onSelectConversation={selectConversation}
              filters={filters}
              hasMoreConversations={hasMoreConversations}
              isLoadingMoreConversations={isLoadingMoreConversations}
              onLoadMore={loadMoreConversations}
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

