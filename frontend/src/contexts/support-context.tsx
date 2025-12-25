import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useUserRole } from '@/hooks/useUserRole';
import { toast } from 'sonner';
import type {
  Conversation,
  Message,
  TypingIndicator,
  AdminNote,
  MessagePriority,
  AttachmentType,
  ConversationStatus,
  SupportContextState,
  SupportContextMethods,
} from '@/types/support';

interface SupportContextType extends SupportContextState, SupportContextMethods {}

const SupportContext = createContext<SupportContextType | undefined>(undefined);

export const useSupport = () => {
  const context = useContext(SupportContext);
  if (!context) {
    throw new Error('useSupport must be used within SupportProvider');
  }
  return context;
};

interface SupportProviderProps {
  children: React.ReactNode;
}

export const SupportProvider: React.FC<SupportProviderProps> = ({ children }) => {
  const { data: userRole } = useUserRole();
  const isAdmin = userRole?.isAdmin || false;

  // State
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [typingIndicators, setTypingIndicators] = useState<TypingIndicator[]>([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isLoadingMoreMessages, setIsLoadingMoreMessages] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Refs for real-time subscriptions
  const conversationsChannelRef = useRef<any>(null);
  const messagesChannelRef = useRef<any>(null);
  const typingChannelRef = useRef<any>(null);
  const notificationsChannelRef = useRef<any>(null);
  const typingTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const oldestMessageIdRef = useRef<string | null>(null);
  const isAtBottomRef = useRef(true);

  // Load user's conversations
  const loadConversations = useCallback(async () => {
    if (isAdmin) return; // Admins use loadAllConversations
    if (!userRole?.userId) return; // Don't query if user ID is not available
    
    setIsLoadingConversations(true);
    try {
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('user_id', userRole.userId)
        .order('last_message_at', { ascending: false });

      if (error) throw error;
      setConversations(data || []);
    } catch (error: any) {
      console.error('Error loading conversations:', error);
      toast.error('Failed to load conversations');
    } finally {
      setIsLoadingConversations(false);
    }
  }, [isAdmin, userRole?.userId]);

  // Load all conversations (admin only)
  const loadAllConversations = useCallback(async () => {
    if (!isAdmin) return;
    setIsLoadingConversations(true);
    try {
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .order('last_message_at', { ascending: false });

      if (error) throw error;

      // Get user profiles separately since foreign keys reference auth.users, not profiles
      const userIds = [...new Set([
        ...(data || []).map(c => c.user_id),
        ...(data || []).map(c => c.assigned_to).filter(Boolean)
      ])];

      let profilesMap = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, name, email')
          .in('id', userIds);

        if (profiles) {
          profilesMap = profiles.reduce((acc, p) => {
            acc[p.id] = p;
            return acc;
          }, {});
        }
      }

      // Get unread counts for each conversation
      const conversationsWithUnread = await Promise.all(
        (data || []).map(async (conv) => {
          if (!userRole?.userId) {
            return {
              ...conv,
              unread_count: 0,
              user: profilesMap[conv.user_id] || null,
              assigned_admin: conv.assigned_to ? (profilesMap[conv.assigned_to] || null) : null,
            };
          }
          
          const { count } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('conversation_id', conv.id)
            .is('read_at', null)
            .neq('sender_id', userRole.userId);

          return {
            ...conv,
            unread_count: count || 0,
            user: profilesMap[conv.user_id] || null,
            assigned_admin: conv.assigned_to ? (profilesMap[conv.assigned_to] || null) : null,
          };
        })
      );

      setConversations(conversationsWithUnread);
    } catch (error: any) {
      console.error('Error loading all conversations:', error);
      toast.error('Failed to load conversations');
    } finally {
      setIsLoadingConversations(false);
    }
  }, [isAdmin, userRole?.userId]);

  // Get or create conversation (enforces single open conversation per user)
  const getOrCreateConversation = useCallback(async (): Promise<Conversation | null> => {
    if (isAdmin) return null; // Admins don't auto-create conversations
    if (!userRole?.userId) return null; // Don't create if user ID is not available

    try {
      // First, try to get existing open conversation
      const { data: existing, error: existingError } = await supabase
        .from('conversations')
        .select('*')
        .eq('user_id', userRole.userId)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing && !existingError) {
        return existing;
      }

      // If no open conversation, get the most recent conversation
      const { data: recent, error: recentError } = await supabase
        .from('conversations')
        .select('*')
        .eq('user_id', userRole.userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (recent && !recentError) {
        return recent;
      }

      // Create new conversation
      const { data: newConv, error: createError } = await supabase
        .from('conversations')
        .insert({
          user_id: userRole.userId,
          status: 'open',
        })
        .select()
        .single();

      if (createError) throw createError;
      return newConv;
    } catch (error: any) {
      console.error('Error getting/creating conversation:', error);
      toast.error('Failed to create conversation');
      return null;
    }
  }, [isAdmin, userRole?.userId]);

  // Select conversation and load messages
  const selectConversation = useCallback(async (conversationId: string) => {
    const conversation = conversations.find((c) => c.id === conversationId);
    if (conversation) {
      setCurrentConversation(conversation);
      await loadMessages(conversationId);
      await markMessagesAsRead(conversationId);
    }
  }, [conversations]);

  // Load messages for a conversation
  const loadMessages = useCallback(async (conversationId: string) => {
    setIsLoadingMessages(true);
    setHasMoreMessages(false);
    oldestMessageIdRef.current = null;

    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      const messagesData = (data || []).reverse(); // Reverse to show oldest first
      setMessages(messagesData);

      if (messagesData.length > 0) {
        oldestMessageIdRef.current = messagesData[0].id;
        // Check if there are more messages
        const { count } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('conversation_id', conversationId)
          .lt('created_at', messagesData[0].created_at);

        setHasMoreMessages((count || 0) > 0);
      }
    } catch (error: any) {
      console.error('Error loading messages:', error);
      toast.error('Failed to load messages');
    } finally {
      setIsLoadingMessages(false);
    }
  }, []);

  // Load more (older) messages
  const loadMoreMessages = useCallback(async () => {
    if (!currentConversation || !oldestMessageIdRef.current || isLoadingMoreMessages) return;

    setIsLoadingMoreMessages(true);
    try {
      const oldestMessage = messages.find((m) => m.id === oldestMessageIdRef.current);
      if (!oldestMessage) return;

      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', currentConversation.id)
        .lt('created_at', oldestMessage.created_at)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      const newMessages = (data || []).reverse();
      if (newMessages.length > 0) {
        setMessages((prev) => [...newMessages, ...prev]);
        oldestMessageIdRef.current = newMessages[0].id;

        // Check if there are more messages
        const { count } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('conversation_id', currentConversation.id)
          .lt('created_at', newMessages[0].created_at);

        setHasMoreMessages((count || 0) > 0);
      } else {
        setHasMoreMessages(false);
      }
    } catch (error: any) {
      console.error('Error loading more messages:', error);
      toast.error('Failed to load more messages');
    } finally {
      setIsLoadingMoreMessages(false);
    }
  }, [currentConversation, messages, isLoadingMoreMessages]);

  // Send message
  const sendMessage = useCallback(async (
    content: string,
    attachmentUrl?: string,
    attachmentType?: AttachmentType
  ) => {
    if (!currentConversation) {
      toast.error('No conversation selected');
      return;
    }
    if (!userRole?.userId) {
      toast.error('User not authenticated');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('messages')
        .insert({
          conversation_id: currentConversation.id,
          sender_id: userRole.userId,
          content: content.trim(),
          attachment_url: attachmentUrl || null,
          attachment_type: attachmentType || null,
        })
        .select()
        .single();

      if (error) throw error;

      // Add message to local state
      setMessages((prev) => [...prev, data]);

      // Update conversation in list
      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === currentConversation.id
            ? { ...conv, last_message_at: new Date().toISOString() }
            : conv
        )
      );

      // Mark as read immediately
      await markMessagesAsRead(currentConversation.id);
    } catch (error: any) {
      console.error('Error sending message:', error);
      toast.error('Failed to send message');
    }
  }, [currentConversation, userRole?.userId]);

  // Edit message
  const editMessage = useCallback(async (messageId: string, newContent: string) => {
    if (!userRole?.userId) {
      toast.error('User not authenticated');
      return;
    }
    try {
      const { error } = await supabase
        .from('messages')
        .update({ content: newContent.trim() })
        .eq('id', messageId)
        .eq('sender_id', userRole.userId);

      if (error) throw error;

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId ? { ...msg, content: newContent.trim() } : msg
        )
      );
    } catch (error: any) {
      console.error('Error editing message:', error);
      toast.error('Failed to edit message');
    }
  }, [userRole?.userId]);

  // Delete message (soft delete)
  const deleteMessage = useCallback(async (messageId: string) => {
    if (!userRole?.userId) {
      toast.error('User not authenticated');
      return;
    }
    try {
      const { error } = await supabase
        .from('messages')
        .update({ content: '[Message deleted]' })
        .eq('id', messageId)
        .eq('sender_id', userRole.userId);

      if (error) throw error;

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId ? { ...msg, content: '[Message deleted]' } : msg
        )
      );
    } catch (error: any) {
      console.error('Error deleting message:', error);
      toast.error('Failed to delete message');
    }
  }, [userRole?.userId]);

  // Mark messages as read
  const markMessagesAsRead = useCallback(async (conversationId: string) => {
    try {
      // Use the SECURITY DEFINER function to mark messages as read
      const { error } = await supabase.rpc('mark_conversation_messages_read', {
        p_conversation_id: conversationId,
      });

      if (error) throw error;

      // Update local messages
      setMessages((prev) =>
        prev.map((msg) =>
          msg.conversation_id === conversationId && !msg.read_at
            ? { ...msg, read_at: new Date().toISOString() }
            : msg
        )
      );
    } catch (error: any) {
      console.error('Error marking messages as read:', error);
    }
  }, []);

  // Set typing indicator
  const setTyping = useCallback(async (conversationId: string, isTyping: boolean) => {
    if (!conversationId || !userRole?.userId) return;

    try {
      // Clear existing timeout
      const existingTimeout = typingTimeoutsRef.current.get(conversationId);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
        typingTimeoutsRef.current.delete(conversationId);
      }

      // Upsert typing indicator
      const { error } = await supabase
        .from('typing_indicators')
        .upsert(
          {
            conversation_id: conversationId,
            user_id: userRole.userId,
            is_typing: isTyping,
          },
          { onConflict: 'conversation_id,user_id' }
        );

      if (error) throw error;

      // Set timeout to clear typing after 3 seconds
      if (isTyping) {
        const timeout = setTimeout(async () => {
          await setTyping(conversationId, false);
        }, 3000);
        typingTimeoutsRef.current.set(conversationId, timeout);
      }
    } catch (error: any) {
      console.error('Error setting typing indicator:', error);
    }
  }, [userRole?.userId]);

  // Update conversation status
  const updateConversationStatus = useCallback(async (conversationId: string, status: ConversationStatus) => {
    try {
      const { error } = await supabase
        .from('conversations')
        .update({ status })
        .eq('id', conversationId);

      if (error) throw error;

      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === conversationId ? { ...conv, status } : conv
        )
      );

      if (currentConversation?.id === conversationId) {
        setCurrentConversation((prev) => (prev ? { ...prev, status } : null));
      }
    } catch (error: any) {
      console.error('Error updating conversation status:', error);
      toast.error('Failed to update conversation status');
    }
  }, [currentConversation]);

  // Close conversation
  const closeConversation = useCallback(async (conversationId: string) => {
    await updateConversationStatus(conversationId, 'closed');
  }, [updateConversationStatus]);

  // Assign conversation (admin only)
  const assignConversation = useCallback(async (conversationId: string, adminId: string) => {
    if (!isAdmin) return;
    try {
      const { error } = await supabase
        .from('conversations')
        .update({ assigned_to: adminId })
        .eq('id', conversationId);

      if (error) throw error;

      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === conversationId ? { ...conv, assigned_to: adminId } : conv
        )
      );
    } catch (error: any) {
      console.error('Error assigning conversation:', error);
      toast.error('Failed to assign conversation');
    }
  }, [isAdmin]);

  // Set priority (admin only)
  const setPriority = useCallback(async (conversationId: string, priority: MessagePriority) => {
    if (!isAdmin) return;
    try {
      const { error } = await supabase
        .from('conversations')
        .update({ priority })
        .eq('id', conversationId);

      if (error) throw error;

      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === conversationId ? { ...conv, priority } : conv
        )
      );
    } catch (error: any) {
      console.error('Error setting priority:', error);
      toast.error('Failed to set priority');
    }
  }, [isAdmin]);

  // Add tag (admin only)
  const addTag = useCallback(async (conversationId: string, tag: string) => {
    if (!isAdmin) return;
    try {
      const { error } = await supabase
        .from('conversation_tags')
        .insert({
          conversation_id: conversationId,
          tag: tag.trim(),
        });

      if (error) throw error;

      // Refresh conversation to get updated tags
      await loadAllConversations();
    } catch (error: any) {
      console.error('Error adding tag:', error);
      toast.error('Failed to add tag');
    }
  }, [isAdmin, loadAllConversations]);

  // Remove tag (admin only)
  const removeTag = useCallback(async (conversationId: string, tag: string) => {
    if (!isAdmin) return;
    try {
      const { error } = await supabase
        .from('conversation_tags')
        .delete()
        .eq('conversation_id', conversationId)
        .eq('tag', tag);

      if (error) throw error;

      // Refresh conversation to get updated tags
      await loadAllConversations();
    } catch (error: any) {
      console.error('Error removing tag:', error);
      toast.error('Failed to remove tag');
    }
  }, [isAdmin, loadAllConversations]);

  // Add admin note (admin only)
  const addAdminNote = useCallback(async (conversationId: string, note: string) => {
    if (!isAdmin || !userRole?.userId) return;
    try {
      const { error } = await supabase
        .from('admin_notes')
        .insert({
          conversation_id: conversationId,
          admin_id: userRole.userId,
          note: note.trim(),
        });

      if (error) throw error;
      toast.success('Note added');
    } catch (error: any) {
      console.error('Error adding admin note:', error);
      toast.error('Failed to add note');
    }
  }, [isAdmin, userRole?.userId]);

  // Get admin notes (admin only)
  const getAdminNotes = useCallback(async (conversationId: string): Promise<AdminNote[]> => {
    if (!isAdmin) return [];
    try {
      const { data, error } = await supabase
        .from('admin_notes')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error: any) {
      console.error('Error getting admin notes:', error);
      return [];
    }
  }, [isAdmin]);

  // Get unread count (admin only)
  const getUnreadCount = useCallback(async (): Promise<number> => {
    if (!isAdmin || !userRole?.userId) return 0;
    try {
      const { count, error } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .is('read_at', null)
        .neq('sender_id', userRole.userId);

      if (error) throw error;
      return count || 0;
    } catch (error: any) {
      console.error('Error getting unread count:', error);
      return 0;
    }
  }, [isAdmin, userRole?.userId]);

  // Real-time subscriptions
  useEffect(() => {
    if (!userRole?.userId) return;

    // Subscribe to conversation changes
    const conversationsChannel = supabase
      .channel('conversations-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations',
          filter: isAdmin ? undefined : `user_id=eq.${userRole.userId}`,
        },
        async (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            if (isAdmin) {
              await loadAllConversations();
            } else {
              await loadConversations();
            }
          }
        }
      )
      .subscribe();

    conversationsChannelRef.current = conversationsChannel;

    // Subscribe to message inserts for current conversation
    const messagesChannel = supabase
      .channel('messages-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        async (payload) => {
          const newMessage = payload.new as Message;
          
          // If it's for the current conversation, add it
          if (currentConversation && newMessage.conversation_id === currentConversation.id) {
            setMessages((prev) => [...prev, newMessage]);
            // Auto-mark as read if we're viewing the conversation
            if (isAtBottomRef.current) {
              await markMessagesAsRead(currentConversation.id);
            }
          } else {
            // Show browser notification if tab is hidden
            if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
              new Notification('New support message', {
                body: newMessage.content.substring(0, 100),
                icon: '/favicon.svg',
              });
            }
          }

          // Update unread count for admins
          if (isAdmin) {
            const count = await getUnreadCount();
            setUnreadCount(count);
          }
        }
      )
      .subscribe();

    messagesChannelRef.current = messagesChannel;

    // Subscribe to typing indicators for current conversation
    const typingChannel = supabase
      .channel('typing-indicators')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'typing_indicators',
        },
        async (payload) => {
          if (currentConversation) {
            const { data } = await supabase
              .from('typing_indicators')
              .select('*')
              .eq('conversation_id', currentConversation.id)
              .eq('is_typing', true)
              .neq('user_id', userRole.userId);

            setTypingIndicators(data || []);
          }
        }
      )
      .subscribe();

    typingChannelRef.current = typingChannel;

    return () => {
      supabase.removeChannel(conversationsChannel);
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(typingChannel);
      // Clear all typing timeouts
      typingTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
      typingTimeoutsRef.current.clear();
    };
  }, [userRole?.userId, isAdmin, currentConversation, loadConversations, loadAllConversations, markMessagesAsRead, getUnreadCount]);

  // Auto-open conversation for non-admin users
  useEffect(() => {
    if (!isAdmin && userRole?.userId && conversations.length === 0 && !isLoadingConversations) {
      getOrCreateConversation().then((conv) => {
        if (conv) {
          setCurrentConversation(conv);
          loadMessages(conv.id);
          markMessagesAsRead(conv.id);
        }
      });
    }
  }, [isAdmin, userRole?.userId, conversations.length, isLoadingConversations, getOrCreateConversation, loadMessages, markMessagesAsRead]);

  // Load conversations on mount
  useEffect(() => {
    if (userRole?.userId) {
      if (isAdmin) {
        loadAllConversations();
        getUnreadCount().then(setUnreadCount);
      } else {
        loadConversations();
      }
    }
  }, [userRole?.userId, isAdmin, loadConversations, loadAllConversations, getUnreadCount]);

  // Request notification permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const value: SupportContextType = {
    conversations,
    currentConversation,
    messages,
    typingIndicators,
    isLoadingConversations,
    isLoadingMessages,
    isLoadingMoreMessages,
    hasMoreMessages,
    unreadCount,
    isAdmin,
    loadConversations,
    loadAllConversations,
    getOrCreateConversation,
    selectConversation,
    loadMessages,
    loadMoreMessages,
    sendMessage,
    editMessage,
    deleteMessage,
    markMessagesAsRead,
    setTyping,
    updateConversationStatus,
    closeConversation,
    assignConversation,
    setPriority,
    addTag,
    removeTag,
    addAdminNote,
    getAdminNotes,
    getUnreadCount,
  };

  return <SupportContext.Provider value={value}>{children}</SupportContext.Provider>;
};

