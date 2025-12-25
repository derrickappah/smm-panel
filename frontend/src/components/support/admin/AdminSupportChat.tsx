import React from 'react';
import { SupportChat } from '../SupportChat';
import { ConversationHeader } from './ConversationHeader';
import { AdminNotes } from './AdminNotes';
import { useSupport } from '@/contexts/support-context';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { ConversationStatus, MessagePriority } from '@/types/support';

export const AdminSupportChat: React.FC = () => {
  const {
    currentConversation,
    setPriority,
    assignConversation,
    addTag,
    removeTag,
    closeConversation,
    updateConversationStatus,
  } = useSupport();

  if (!currentConversation) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        <p>Select a conversation to view</p>
      </div>
    );
  }

  const handleStatusChange = async (status: ConversationStatus) => {
    if (!currentConversation) return;
    await updateConversationStatus(currentConversation.id, status);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-shrink-0">
        <ConversationHeader
          conversation={currentConversation}
          onStatusChange={handleStatusChange}
          onPriorityChange={(priority) => setPriority(currentConversation.id, priority)}
          onAssignmentChange={(adminId) => assignConversation(currentConversation.id, adminId)}
          onAddTag={(tag) => addTag(currentConversation.id, tag)}
          onRemoveTag={(tag) => removeTag(currentConversation.id, tag)}
        />
      </div>

      <Tabs defaultValue="chat" className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <TabsList className="mx-4 mt-4 flex-shrink-0">
          <TabsTrigger value="chat">Chat</TabsTrigger>
          <TabsTrigger value="notes">Admin Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="chat" className="flex-1 flex flex-col mt-0 min-h-0 overflow-hidden">
          <SupportChat />
        </TabsContent>

        <TabsContent value="notes" className="flex-1 overflow-y-auto p-4 min-h-0">
          <AdminNotes conversationId={currentConversation.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

