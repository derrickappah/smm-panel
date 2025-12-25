import React, { useState, useEffect } from 'react';
import { SupportProvider, useSupport } from '@/contexts/support-context';
import { AdminSupportChat } from '@/components/support/admin/AdminSupportChat';
import { ConversationsList } from '@/components/support/admin/ConversationsList';
import { ConversationSearch } from '@/components/support/admin/ConversationSearch';
import type { ConversationFilters } from '@/types/support';

const AdminSupportContent: React.FC = () => {
  const {
    conversations,
    currentConversation,
    loadAllConversations,
    selectConversation,
    setPriority,
    assignConversation,
    addTag,
    removeTag,
    updateConversationStatus,
  } = useSupport();

  const [filters, setFilters] = useState<ConversationFilters>({});

  useEffect(() => {
    loadAllConversations();
  }, [loadAllConversations]);

  return (
    <div className="flex h-screen">
      {/* Sidebar - Conversations List */}
      <div className="w-80 border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold">Conversations</h2>
        </div>
        <ConversationSearch filters={filters} onFiltersChange={setFilters} />
        <div className="flex-1 overflow-hidden">
          <ConversationsList
            conversations={conversations}
            currentConversationId={currentConversation?.id || null}
            onSelectConversation={selectConversation}
            filters={filters}
          />
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <AdminSupportChat />
      </div>
    </div>
  );
};

const AdminSupport: React.FC = () => {
  return (
    <SupportProvider>
      <AdminSupportContent />
    </SupportProvider>
  );
};

export default AdminSupport;

