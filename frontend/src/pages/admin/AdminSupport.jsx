import React, { useState, useEffect } from 'react';
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

  const [filters, setFilters] = useState({});

  useEffect(() => {
    loadAllConversations();
  }, [loadAllConversations]);

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm w-full max-w-full overflow-hidden flex flex-col h-[calc(100vh-3rem)]">
      <div className="flex flex-1 min-h-0">
        {/* Sidebar - Conversations List */}
        <div className="w-80 border-r border-gray-200 flex flex-col bg-white">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold">Conversations</h2>
          </div>
          <ConversationSearch filters={filters} onFiltersChange={setFilters} />
          <div className="flex-1 min-h-0 overflow-hidden">
            <ConversationsList
              conversations={conversations}
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

