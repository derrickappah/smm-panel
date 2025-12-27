import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useUserRole } from '@/hooks/useUserRole';
import { toast } from 'sonner';
import type {
  Conversation,
  Ticket,
  Message,
  TypingIndicator,
  AdminNote,
  MessagePriority,
  AttachmentType,
  ConversationStatus,
  TicketStatus,
  TicketCategory,
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
  const { data: userRole, isLoading: isLoadingUserRole } = useUserRole();
  const isAdmin = userRole?.isAdmin || false;

  // State - Tickets
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [currentTicket, setCurrentTicket] = useState<Ticket | null>(null);
  const [isLoadingTickets, setIsLoadingTickets] = useState(false);
  const [isLoadingMoreTickets, setIsLoadingMoreTickets] = useState(false);
  const [hasMoreTickets, setHasMoreTickets] = useState(false);
  const ticketsOffsetRef = useRef(0);
  const TICKETS_PAGE_SIZE = 100;
  const currentTicketRef = useRef<Ticket | null>(null);

  // State - Messages (shared between tickets and conversations)
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isLoadingMoreMessages, setIsLoadingMoreMessages] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const oldestMessageIdRef = useRef<string | null>(null);
  const isAtBottomRef = useRef(true);

  // State - Conversations (legacy, kept for backward compatibility)
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
  const [typingIndicators, setTypingIndicators] = useState<TypingIndicator[]>([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [isLoadingMoreConversations, setIsLoadingMoreConversations] = useState(false);
  const [hasMoreConversations, setHasMoreConversations] = useState(false);
  const conversationsOffsetRef = useRef(0);
  const CONVERSATIONS_PAGE_SIZE = 100;
  const [unreadCount, setUnreadCount] = useState(0);

  // Refs for real-time subscriptions
  const conversationsChannelRef = useRef<any>(null);
  const ticketsChannelRef = useRef<any>(null);
  const messagesChannelRef = useRef<any>(null);
  const typingChannelRef = useRef<any>(null);
  const notificationsChannelRef = useRef<any>(null);
  const typingTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const currentConversationRef = useRef<Conversation | null>(null);
  const presenceHeartbeatRef = useRef<NodeJS.Timeout | null>(null);

  // Load user's conversations (should only be 0 or 1 conversation)
  const loadConversations = useCallback(async () => {
    if (isAdmin) return; // Admins use loadAllConversations
    if (!userRole?.userId) return; // Don't query if user ID is not available
    
    setIsLoadingConversations(true);
    try {
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('user_id', userRole.userId)
        .maybeSingle(); // Use maybeSingle since there should only be one conversation

      if (error) throw error;
      const conversation = data || null;
      setConversations(conversation ? [conversation] : []);
    } catch (error: any) {
      console.error('Error loading conversations:', error);
      toast.error('Failed to load conversations');
    } finally {
      setIsLoadingConversations(false);
    }
  }, [isAdmin, userRole?.userId]);

  // Load all conversations (admin only) with pagination
  const loadAllConversations = useCallback(async (reset: boolean = true) => {
    if (!isAdmin) return;
    
    if (reset) {
      setIsLoadingConversations(true);
      conversationsOffsetRef.current = 0;
    } else {
      setIsLoadingMoreConversations(true);
    }
    
    try {
      // Verify authentication before making queries
      const { data: { session }, error: authError } = await supabase.auth.getSession();
      if (authError || !session) {
        console.warn('Admin not authenticated, cannot load conversations');
        return;
      }

      const offset = reset ? 0 : conversationsOffsetRef.current;
      const limit = CONVERSATIONS_PAGE_SIZE;
      
      // Load conversations with pagination
      const { data, error, count } = await supabase
        .from('conversations')
        .select('*', { count: 'exact' })
        .order('last_message_at', { ascending: false })
        .range(offset, offset + limit - 1);

      // Handle RLS permission errors
      if (error) {
        if (error.code === '42501' || error.code === 'PGRST301') {
          console.error('Permission denied: Admin access required or is_admin() function not working');
          throw new Error('Permission denied: Admin access required');
        }
        throw error;
      }

      // Check if there are more conversations to load
      const totalLoaded = offset + (data?.length || 0);
      setHasMoreConversations(totalLoaded < (count || 0));

      if (!data || data.length === 0) {
        if (reset) {
          setConversations([]);
        }
        return;
      }

      // Get user profiles separately since foreign keys reference auth.users, not profiles
      const userIds = Array.from(new Set([
        ...data.map(c => c.user_id),
        ...data.map(c => c.assigned_to).filter(Boolean)
      ]));

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

      // Get all unread counts and most recent unread timestamps in a single query (fixes N+1 problem)
      let unreadCountMap: Record<string, number> = {};
      let unreadLatestMap: Record<string, string> = {};
      if (userRole?.userId) {
        const conversationIds = data.map(c => c.id);
        
        // Single query to get all unread messages for these conversations (with timestamps)
        const { data: unreadMessages } = await supabase
          .from('messages')
          .select('conversation_id, created_at')
          .in('conversation_id', conversationIds)
          .is('read_at', null)
          .neq('sender_id', userRole.userId)
          .order('created_at', { ascending: false });

        // Build unread count map and most recent unread timestamp map
        (unreadMessages || []).forEach((msg) => {
          // Count unread messages
          unreadCountMap[msg.conversation_id] = (unreadCountMap[msg.conversation_id] || 0) + 1;
          
          // Track most recent unread message timestamp (messages are already sorted desc)
          if (!unreadLatestMap[msg.conversation_id]) {
            unreadLatestMap[msg.conversation_id] = msg.created_at;
          }
        });
      }

      // Combine conversations with profiles and unread counts
      const conversationsWithUnread = data.map((conv) => ({
        ...conv,
        unread_count: unreadCountMap[conv.id] || 0,
        unread_latest_at: unreadLatestMap[conv.id] || null,
        user: profilesMap[conv.user_id] || null,
        assigned_admin: conv.assigned_to ? (profilesMap[conv.assigned_to] || null) : null,
      }));

      // Sort conversations: unread first (by most recent unread), then read (by last_message_at)
      conversationsWithUnread.sort((a, b) => {
        // First priority: conversations with unread messages come first
        if (a.unread_count > 0 && b.unread_count === 0) return -1;
        if (a.unread_count === 0 && b.unread_count > 0) return 1;
        
        // If both have unread, sort by most recent unread message timestamp
        if (a.unread_count > 0 && b.unread_count > 0) {
          const aLatest = a.unread_latest_at || a.last_message_at;
          const bLatest = b.unread_latest_at || b.last_message_at;
          return new Date(bLatest).getTime() - new Date(aLatest).getTime();
        }
        
        // If neither has unread, sort by last_message_at
        return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
      });

      // If reset, replace conversations, otherwise append
      if (reset) {
        setConversations(conversationsWithUnread);
        conversationsOffsetRef.current = conversationsWithUnread.length;
      } else {
        setConversations((prev) => [...prev, ...conversationsWithUnread]);
        conversationsOffsetRef.current += conversationsWithUnread.length;
      }
    } catch (error: any) {
      console.error('Error loading all conversations:', error);
      toast.error('Failed to load conversations');
    } finally {
      setIsLoadingConversations(false);
      setIsLoadingMoreConversations(false);
    }
  }, [isAdmin, userRole?.userId]);

  // Load more conversations (pagination)
  const loadMoreConversations = useCallback(async () => {
    if (!isAdmin || isLoadingMoreConversations || !hasMoreConversations) return;
    await loadAllConversations(false);
  }, [isAdmin, isLoadingMoreConversations, hasMoreConversations, loadAllConversations]);

  // Get or create conversation (each user has exactly one conversation)
  const getOrCreateConversation = useCallback(async (): Promise<Conversation | null> => {
    console.log('getOrCreateConversation called', { isAdmin, userId: userRole?.userId });
    if (isAdmin) {
      console.log('User is admin, skipping conversation creation');
      return null; // Admins don't auto-create conversations
    }
    if (!userRole?.userId) {
      console.log('No user ID available, skipping conversation creation');
      return null; // Don't create if user ID is not available
    }

    try {
      // Verify authentication before making queries
      const { data: { session }, error: authError } = await supabase.auth.getSession();
      if (authError || !session) {
        console.warn('User not authenticated, cannot get/create conversation', authError);
        return null;
      }

      // Verify that userRole.userId matches the authenticated user
      if (session.user.id !== userRole.userId) {
        console.warn('User ID mismatch, cannot get/create conversation', { sessionUserId: session.user.id, userRoleUserId: userRole.userId });
        return null;
      }
      
      console.log('Authentication verified, proceeding with conversation get/create');

      // Get the user's single conversation (should only be 0 or 1)
      const { data: existing, error: existingError } = await supabase
        .from('conversations')
        .select('*')
        .eq('user_id', userRole.userId)
        .maybeSingle();

      console.log('Existing conversation query result:', { existing, error: existingError });

      // Handle RLS permission errors
      if (existingError) {
        if (existingError.code === '42501' || existingError.code === 'PGRST301') {
          console.error('Permission denied: User may not be authenticated correctly', existingError);
          return null;
        }
        // For other errors, continue to try creating
        console.warn('Error fetching existing conversation, will try to create:', existingError);
      }

      if (existing && !existingError) {
        console.log('Found existing conversation:', existing.id);
        // Add to conversations list if not already there
        setConversations((prev) => {
          if (prev.some(c => c.id === existing.id)) {
            return prev;
          }
          return [existing, ...prev];
        });
        return existing;
      }
      
      console.log('No existing conversation found, creating new one...');

      // Fetch user's name from profiles to use as subject
      const { data: profile } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', userRole.userId)
        .single();

      const subject = profile?.name || 'Support Conversation';

      // If no conversation exists, create one
      const { data: newConv, error: createError } = await supabase
        .from('conversations')
        .insert({
          user_id: userRole.userId,
          status: 'open',
          subject: subject,
        })
        .select()
        .single();

      console.log('Create conversation result:', { newConv, createError });

      // If we get a unique constraint violation, it means another request created it
      // In that case, fetch the existing conversation
      if (createError) {
        console.log('Create error occurred:', createError);
        if (createError.code === '23505' || createError.message?.includes('unique constraint') || createError.message?.includes('duplicate key')) {
          console.log('Unique constraint violation, fetching existing conversation...');
          // Race condition: conversation was created by another request, fetch it
          const { data: raceConv, error: raceError } = await supabase
            .from('conversations')
            .select('*')
            .eq('user_id', userRole.userId)
            .maybeSingle();
          
          console.log('Race condition fetch result:', { raceConv, raceError });
          if (raceConv && !raceError) {
            // Add to conversations list if not already there
            setConversations((prev) => {
              if (prev.some(c => c.id === raceConv.id)) {
                return prev;
              }
              return [raceConv, ...prev];
            });
            return raceConv;
          }
          console.error('Failed to fetch conversation after race condition:', raceError);
          return null;
        }
        // Handle RLS permission errors
        if (createError.code === '42501' || createError.code === 'PGRST301') {
          console.error('Permission denied when creating conversation', createError);
          return null;
        }
        console.error('Unexpected error creating conversation:', createError);
        throw createError;
      }
      
      if (!newConv) {
        console.error('Conversation creation succeeded but no data returned');
        return null;
      }
      
      console.log('Successfully created conversation:', newConv.id);
      // Add new conversation to list
      setConversations((prev) => {
        if (prev.some(c => c.id === newConv.id)) {
          return prev;
        }
        return [newConv, ...prev];
      });
      
      return newConv;
    } catch (error: any) {
      console.error('Error getting/creating conversation:', error);
      // Don't show error toast for unique constraint violations (race condition)
      if (error.code !== '23505' && !error.message?.includes('unique constraint') && !error.message?.includes('duplicate key')) {
        toast.error('Failed to create conversation');
      }
      return null;
    }
  }, [isAdmin, userRole?.userId]);

  // Load messages for a conversation or ticket
  const loadMessages = useCallback(async (ticketIdOrConversationId: string, isTicket: boolean = false) => {
    setIsLoadingMessages(true);
    setHasMoreMessages(false);
    oldestMessageIdRef.current = null;

    try {
      let query = supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (isTicket) {
        query = query.eq('ticket_id', ticketIdOrConversationId);
      } else {
        query = query.eq('conversation_id', ticketIdOrConversationId);
      }

      const { data, error } = await query;

      if (error) throw error;

      const messagesData = (data || []).reverse(); // Reverse to show oldest first
      setMessages(messagesData);

      if (messagesData.length > 0) {
        oldestMessageIdRef.current = messagesData[0].id;
        // Check if there are more messages
        let countQuery = supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .lt('created_at', messagesData[0].created_at);

        if (isTicket) {
          countQuery = countQuery.eq('ticket_id', ticketIdOrConversationId);
        } else {
          countQuery = countQuery.eq('conversation_id', ticketIdOrConversationId);
        }

        const { count } = await countQuery;
        setHasMoreMessages((count || 0) > 0);
      }
    } catch (error: any) {
      console.error('Error loading messages:', error);
      toast.error('Failed to load messages');
    } finally {
      setIsLoadingMessages(false);
    }
  }, []);

  // Load more (older) messages (works with both tickets and conversations)
  const loadMoreMessages = useCallback(async () => {
    if ((!currentTicket && !currentConversation) || !oldestMessageIdRef.current || isLoadingMoreMessages) return;

    setIsLoadingMoreMessages(true);
    try {
      const oldestMessage = messages.find((m) => m.id === oldestMessageIdRef.current);
      if (!oldestMessage) return;

      let query = supabase
        .from('messages')
        .select('*')
        .lt('created_at', oldestMessage.created_at)
        .order('created_at', { ascending: false })
        .limit(50);

      if (currentTicket) {
        query = query.eq('ticket_id', currentTicket.id);
      } else if (currentConversation) {
        query = query.eq('conversation_id', currentConversation.id);
      } else {
        return;
      }

      const { data, error } = await query;

      if (error) throw error;

      const newMessages = (data || []).reverse();
      if (newMessages.length > 0) {
        setMessages((prev) => [...newMessages, ...prev]);
        oldestMessageIdRef.current = newMessages[0].id;

        // Check if there are more messages
        let countQuery = supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .lt('created_at', newMessages[0].created_at);

        if (currentTicket) {
          countQuery = countQuery.eq('ticket_id', currentTicket.id);
        } else if (currentConversation) {
          countQuery = countQuery.eq('conversation_id', currentConversation.id);
        }

        const { count } = await countQuery;
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
  }, [currentTicket, currentConversation, messages, isLoadingMoreMessages]);

  // Mark messages as read (for both tickets and conversations) - MUST be defined before sendTicketMessage
  const markMessagesAsRead = useCallback(async (ticketIdOrConversationId: string, isTicket: boolean = false) => {
    try {
      if (isTicket) {
        // For tickets, mark messages directly
        const { error } = await supabase
          .from('messages')
          .update({ read_at: new Date().toISOString() })
          .eq('ticket_id', ticketIdOrConversationId)
          .is('read_at', null)
          .neq('sender_id', userRole?.userId || '');

        if (error) throw error;

        // Update local messages
        setMessages((prev) =>
          prev.map((msg) =>
            msg.ticket_id === ticketIdOrConversationId && !msg.read_at && msg.sender_id !== userRole?.userId
              ? { ...msg, read_at: new Date().toISOString() }
              : msg
          )
        );
      } else {
        // Use the SECURITY DEFINER function for conversations
        const { error } = await supabase.rpc('mark_conversation_messages_read', {
          p_conversation_id: ticketIdOrConversationId,
        });

        if (error) throw error;

        // Update local messages
        setMessages((prev) =>
          prev.map((msg) =>
            msg.conversation_id === ticketIdOrConversationId && !msg.read_at
              ? { ...msg, read_at: new Date().toISOString() }
              : msg
          )
        );
      }
    } catch (error: any) {
      console.error('Error marking messages as read:', error);
    }
  }, [userRole?.userId]);

  // Send message to ticket (with status validation) - MUST be defined before sendMessage
  const sendTicketMessage = useCallback(async (
    content: string,
    attachmentUrl?: string,
    attachmentType?: AttachmentType
  ) => {
    if (!currentTicket) {
      toast.error('No ticket selected');
      return;
    }
    if (!userRole?.userId) {
      toast.error('User not authenticated');
      return;
    }

    // Check if user can send message (status must be 'Replied')
    if (!isAdmin && currentTicket.status !== 'Replied') {
      toast.error('Please wait for admin reply before sending another message');
      return;
    }

    // Check if ticket is closed
    if (currentTicket.status === 'Closed') {
      toast.error('This ticket is closed');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('messages')
        .insert({
          ticket_id: currentTicket.id,
          sender_id: userRole.userId,
          sender_role: isAdmin ? 'admin' : 'user',
          content: content.trim(),
          attachment_url: attachmentUrl || null,
          attachment_type: attachmentType || null,
        })
        .select()
        .single();

      if (error) throw error;

      // Add message to local state
      setMessages((prev) => {
        if (prev.some(m => m.id === data.id)) {
          return prev;
        }
        return [...prev, data];
      });

      // Update ticket in list (status will be updated by trigger)
      setTickets((prev) =>
        prev.map((t) =>
          t.id === currentTicket.id
            ? { ...t, last_message_at: new Date().toISOString() }
            : t
        )
      );

      // Reload ticket to get updated status
      const { data: updatedTicket } = await supabase
        .from('tickets')
        .select('*')
        .eq('id', currentTicket.id)
        .single();

      if (updatedTicket) {
        setCurrentTicket(updatedTicket);
        currentTicketRef.current = updatedTicket;
        setTickets((prev) =>
          prev.map((t) => (t.id === updatedTicket.id ? updatedTicket : t))
        );
      }

      // Mark as read immediately
      await markMessagesAsRead(currentTicket.id, true);
    } catch (error: any) {
      console.error('Error sending ticket message:', error);
      toast.error(error.message || 'Failed to send message');
    }
  }, [currentTicket, userRole?.userId, isAdmin, markMessagesAsRead]);

  // Send message (works with both tickets and conversations)
  const sendMessage = useCallback(async (
    content: string,
    attachmentUrl?: string,
    attachmentType?: AttachmentType
  ) => {
    // Prioritize ticket over conversation
    if (currentTicket) {
      await sendTicketMessage(content, attachmentUrl, attachmentType);
      return;
    }

    if (!currentConversation) {
      toast.error('No ticket or conversation selected');
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
          sender_role: isAdmin ? 'admin' : 'user',
          content: content.trim(),
          attachment_url: attachmentUrl || null,
          attachment_type: attachmentType || null,
        })
        .select()
        .single();

      if (error) throw error;

      // Add message to local state (check for duplicates)
      setMessages((prev) => {
        if (prev.some(m => m.id === data.id)) {
          return prev; // Already exists (from real-time subscription)
        }
        return [...prev, data];
      });

      // Update conversation in list
      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === currentConversation.id
            ? { ...conv, last_message_at: new Date().toISOString() }
            : conv
        )
      );

      // Mark as read immediately
      await markMessagesAsRead(currentConversation.id, false);
    } catch (error: any) {
      console.error('Error sending message:', error);
      toast.error('Failed to send message');
    }
  }, [currentTicket, currentConversation, userRole?.userId, isAdmin, sendTicketMessage, markMessagesAsRead]);

  // Edit message
  const editMessage = useCallback(async (messageId: string, newContent: string) => {
    if (!userRole?.userId) {
      toast.error('User not authenticated');
      return;
    }
    try {
      // Build query - admins can edit any message, users can only edit their own
      let query = supabase
        .from('messages')
        .update({ content: newContent.trim() })
        .eq('id', messageId);
      
      // Only restrict to own messages if not admin
      if (!isAdmin) {
        query = query.eq('sender_id', userRole.userId);
      }

      const { error } = await query;

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
  }, [userRole?.userId, isAdmin]);

  // Delete message
  // Admins: hard delete (message vanishes completely)
  // Regular users: soft delete (message shows "[Message deleted]")
  const deleteMessage = useCallback(async (messageId: string) => {
    if (!userRole?.userId) {
      toast.error('User not authenticated');
      return;
    }
    try {
      if (isAdmin) {
        // Admin hard delete - completely remove the message
        let query = supabase
          .from('messages')
          .delete()
          .eq('id', messageId);

        const { error } = await query;

        if (error) throw error;

        // Remove message from state
        setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
      } else {
        // Regular user soft delete - mark as deleted
        let query = supabase
          .from('messages')
          .update({ content: '[Message deleted]' })
          .eq('id', messageId)
          .eq('sender_id', userRole.userId);

        const { error } = await query;

        if (error) throw error;

        // Update message in state to show deleted
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === messageId ? { ...msg, content: '[Message deleted]' } : msg
          )
        );
      }
    } catch (error: any) {
      console.error('Error deleting message:', error);
      toast.error('Failed to delete message');
    }
  }, [userRole?.userId, isAdmin]);

  // Select conversation and load messages (defined after loadMessages and markMessagesAsRead)
  const selectConversation = useCallback(async (conversationId: string) => {
    const conversation = conversations.find((c) => c.id === conversationId);
    if (conversation) {
      setCurrentConversation(conversation);
      currentConversationRef.current = conversation;
      await loadMessages(conversationId);
      await markMessagesAsRead(conversationId);
    }
  }, [conversations, loadMessages, markMessagesAsRead]);

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

      if (error) {
        console.error('Error updating conversation status:', error);
        // Provide more specific error messages
        if (error.code === '42501' || error.message?.includes('permission denied') || error.message?.includes('policy')) {
          toast.error('You do not have permission to update this conversation');
        } else {
          toast.error(`Failed to update conversation status: ${error.message || 'Unknown error'}`);
        }
        throw error;
      }

      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === conversationId ? { ...conv, status } : conv
        )
      );

      if (currentConversation?.id === conversationId) {
        setCurrentConversation((prev) => {
        const updated = prev ? { ...prev, status } : null;
        currentConversationRef.current = updated;
        return updated;
      });
      }
    } catch (error: any) {
      // Error already handled above, just log for debugging
      console.error('Error updating conversation status:', error);
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

  // ========== TICKET METHODS ==========

  // Load user's tickets
  const loadTickets = useCallback(async () => {
    if (isAdmin) return; // Admins use loadAllTickets
    if (!userRole?.userId) return;
    
    setIsLoadingTickets(true);
    try {
      const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .eq('user_id', userRole.userId)
        .order('last_message_at', { ascending: false });

      if (error) throw error;
      setTickets(data || []);
    } catch (error: any) {
      console.error('Error loading tickets:', error);
      toast.error('Failed to load tickets');
    } finally {
      setIsLoadingTickets(false);
    }
  }, [isAdmin, userRole?.userId]);

  // Load all tickets (admin only) with pagination
  const loadAllTickets = useCallback(async (reset: boolean = true) => {
    if (!isAdmin) return;
    
    if (reset) {
      setIsLoadingTickets(true);
      ticketsOffsetRef.current = 0;
    } else {
      setIsLoadingMoreTickets(true);
    }
    
    try {
      const { data: { session }, error: authError } = await supabase.auth.getSession();
      if (authError || !session) {
        console.warn('Admin not authenticated, cannot load tickets');
        return;
      }

      const offset = reset ? 0 : ticketsOffsetRef.current;
      const limit = TICKETS_PAGE_SIZE;
      
      const { data, error, count } = await supabase
        .from('tickets')
        .select('*', { count: 'exact' })
        .order('last_message_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        if (error.code === '42501' || error.code === 'PGRST301') {
          console.error('Permission denied: Admin access required');
          throw new Error('Permission denied: Admin access required');
        }
        throw error;
      }

      const totalLoaded = offset + (data?.length || 0);
      setHasMoreTickets(totalLoaded < (count || 0));

      if (!data || data.length === 0) {
        if (reset) {
          setTickets([]);
        }
        return;
      }

      // Get user profiles
      const userIds = Array.from(new Set(data.map(t => t.user_id)));
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

      // Get unread message counts for tickets
      const ticketIds = data.map(t => t.id);
      let unreadCountMap: Record<string, number> = {};
      if (ticketIds.length > 0 && userRole?.userId) {
        const { data: unreadMessages } = await supabase
          .from('messages')
          .select('ticket_id')
          .in('ticket_id', ticketIds)
          .is('read_at', null)
          .neq('sender_id', userRole.userId);

        if (unreadMessages) {
          unreadMessages.forEach((msg) => {
            if (msg.ticket_id) {
              unreadCountMap[msg.ticket_id] = (unreadCountMap[msg.ticket_id] || 0) + 1;
            }
          });
        }
      }

      const ticketsWithUsers = data.map((ticket) => ({
        ...ticket,
        user: profilesMap[ticket.user_id] || null,
        unread_count: unreadCountMap[ticket.id] || 0,
      }));

      // Sort: Pending first, then by last_message_at
      ticketsWithUsers.sort((a, b) => {
        if (a.status === 'Pending' && b.status !== 'Pending') return -1;
        if (a.status !== 'Pending' && b.status === 'Pending') return 1;
        return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
      });

      if (reset) {
        setTickets(ticketsWithUsers);
        ticketsOffsetRef.current = ticketsWithUsers.length;
      } else {
        setTickets((prev) => [...prev, ...ticketsWithUsers]);
        ticketsOffsetRef.current += ticketsWithUsers.length;
      }
    } catch (error: any) {
      console.error('Error loading all tickets:', error);
      toast.error('Failed to load tickets');
    } finally {
      setIsLoadingTickets(false);
      setIsLoadingMoreTickets(false);
    }
  }, [isAdmin, userRole?.userId]);

  // Load more tickets (pagination)
  const loadMoreTickets = useCallback(async () => {
    if (!isAdmin || isLoadingMoreTickets || !hasMoreTickets) return;
    await loadAllTickets(false);
  }, [isAdmin, isLoadingMoreTickets, hasMoreTickets, loadAllTickets]);

  // Create a new ticket
  const createTicket = useCallback(async (
    category: TicketCategory,
    orderId: string | null,
    message: string,
    subcategory?: string | null
  ): Promise<Ticket | null> => {
    if (!userRole?.userId) {
      toast.error('User not authenticated');
      return null;
    }

    // Validate order_id is required for order category
    if (category === 'order' && (!orderId || !orderId.trim())) {
      toast.error('Order ID is required for order-related tickets');
      return null;
    }

    try {
      const { data: { session }, error: authError } = await supabase.auth.getSession();
      if (authError || !session) {
        toast.error('Not authenticated');
        return null;
      }

      // Create ticket
      const { data: ticket, error: ticketError } = await supabase
        .from('tickets')
        .insert({
          user_id: userRole.userId,
          category,
          subcategory: subcategory || null,
          order_id: orderId,
          status: 'Pending',
        })
        .select()
        .single();

      if (ticketError) throw ticketError;
      if (!ticket) {
        toast.error('Failed to create ticket');
        return null;
      }

      // Create first message
      const { error: messageError } = await supabase
        .from('messages')
        .insert({
          ticket_id: ticket.id,
          sender_id: userRole.userId,
          sender_role: 'user',
          content: message.trim(),
        });

      if (messageError) {
        // Rollback: delete ticket if message creation fails
        await supabase.from('tickets').delete().eq('id', ticket.id);
        throw messageError;
      }

      // Add ticket to list
      setTickets((prev) => [ticket, ...prev]);
      
      toast.success('Ticket created successfully');
      return ticket;
    } catch (error: any) {
      console.error('Error creating ticket:', error);
      toast.error(error.message || 'Failed to create ticket');
      return null;
    }
  }, [userRole?.userId]);

  // Select ticket and load messages
  const selectTicket = useCallback(async (ticketId: string) => {
    const ticket = tickets.find((t) => t.id === ticketId);
    if (ticket) {
      setCurrentTicket(ticket);
      currentTicketRef.current = ticket;
      await loadTicketMessages(ticketId);
      await markMessagesAsRead(ticketId, true);
    }
  }, [tickets]);

  // Load messages for a ticket
  const loadTicketMessages = useCallback(async (ticketId: string) => {
    setIsLoadingMessages(true);
    setHasMoreMessages(false);
    oldestMessageIdRef.current = null;

    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('ticket_id', ticketId)
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
          .eq('ticket_id', ticketId)
          .lt('created_at', messagesData[0].created_at);

        setHasMoreMessages((count || 0) > 0);
      }
    } catch (error: any) {
      console.error('Error loading ticket messages:', error);
      toast.error('Failed to load messages');
    } finally {
      setIsLoadingMessages(false);
    }
  }, []);

  // Close ticket (admin only)
  const closeTicket = useCallback(async (ticketId: string) => {
    if (!isAdmin || !userRole?.userId) {
      toast.error('Only admins can close tickets');
      return;
    }

    try {
      const { error } = await supabase.rpc('close_ticket', {
        p_ticket_id: ticketId,
      });

      if (error) throw error;

      // Update ticket in list
      setTickets((prev) =>
        prev.map((t) =>
          t.id === ticketId ? { ...t, status: 'Closed' as TicketStatus } : t
        )
      );

      if (currentTicket?.id === ticketId) {
        setCurrentTicket((prev) => {
          if (!prev) return null;
          const updated = { ...prev, status: 'Closed' as TicketStatus };
          currentTicketRef.current = updated;
          return updated;
        });
      }

      toast.success('Ticket closed');
    } catch (error: any) {
      console.error('Error closing ticket:', error);
      toast.error(error.message || 'Failed to close ticket');
    }
  }, [isAdmin, userRole?.userId, currentTicket]);

  // Real-time subscriptions
  useEffect(() => {
    if (!userRole?.userId) return;

    // Use stable channel names with user ID to avoid conflicts
    const conversationsChannelName = `conversations-changes-${userRole.userId}`;
    const messagesChannelName = `messages-changes-${userRole.userId}`;
    const typingChannelName = `typing-indicators-${userRole.userId}`;

    // Subscribe to conversation changes
    const conversationsChannel = supabase
      .channel(conversationsChannelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations',
          filter: isAdmin ? undefined : `user_id=eq.${userRole.userId}`,
        },
        async (payload) => {
          console.log('Conversation change event:', payload.eventType, payload.new || payload.old);
          
          if (payload.eventType === 'INSERT' && payload.new) {
            // Optimistically add new conversation
            const newConv = payload.new as Conversation;
            
            // Fetch user profile for the new conversation
            if (newConv.user_id) {
              const { data: profile } = await supabase
                .from('profiles')
                .select('id, name, email')
                .eq('id', newConv.user_id)
                .single();
              
              const conversationWithUser = {
                ...newConv,
                user: profile || null,
                unread_count: 0,
              };
              
              setConversations((prev) => {
                // Check if conversation already exists (avoid duplicates)
                if (prev.some(c => c.id === conversationWithUser.id)) {
                  return prev;
                }
                return [conversationWithUser, ...prev];
              });
            }
          } else if (payload.eventType === 'UPDATE' && payload.new) {
            // Optimistically update existing conversation
            const updatedConv = payload.new as Conversation;
            setConversations((prev) =>
              prev.map((conv) =>
                conv.id === updatedConv.id
                  ? { ...conv, ...updatedConv }
                  : conv
              )
            );
            
            // If it's the current conversation, update it
            const currentConv = currentConversationRef.current;
            if (currentConv?.id === updatedConv.id) {
              const updated = { ...currentConv, ...updatedConv };
              setCurrentConversation(updated);
              currentConversationRef.current = updated;
            }
          }
          
          // Refresh unread counts after conversation updates
          if (isAdmin) {
            const count = await getUnreadCount();
            setUnreadCount(count);
          }
        }
      )
      .subscribe((status) => {
        console.log('Conversations subscription status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('✅ Conversations subscription active');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Conversations subscription error');
        }
      });

    conversationsChannelRef.current = conversationsChannel;

    // Subscribe to ticket changes
    const ticketsChannelName = `tickets-changes-${userRole.userId}`;
    const ticketsChannel = supabase
      .channel(ticketsChannelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tickets',
          filter: isAdmin ? undefined : `user_id=eq.${userRole.userId}`,
        },
        async (payload) => {
          console.log('Ticket change event:', payload.eventType, payload.new || payload.old);
          
          if (payload.eventType === 'INSERT' && payload.new) {
            const newTicket = payload.new as Ticket;
            
            // Fetch user profile for the new ticket
            if (newTicket.user_id) {
              const { data: profile } = await supabase
                .from('profiles')
                .select('id, name, email')
                .eq('id', newTicket.user_id)
                .single();
              
              const ticketWithUser = {
                ...newTicket,
                user: profile || null,
              };
              
              setTickets((prev) => {
                if (prev.some(t => t.id === ticketWithUser.id)) {
                  return prev;
                }
                return [ticketWithUser, ...prev];
              });
            }
          } else if (payload.eventType === 'UPDATE' && payload.new) {
            const updatedTicket = payload.new as Ticket;
            setTickets((prev) =>
              prev.map((t) =>
                t.id === updatedTicket.id
                  ? { ...t, ...updatedTicket }
                  : t
              )
            );
            
            // If it's the current ticket, update it
            const currentTicket = currentTicketRef.current;
            if (currentTicket?.id === updatedTicket.id) {
              const updated = { ...currentTicket, ...updatedTicket };
              setCurrentTicket(updated);
              currentTicketRef.current = updated;
            }
          }
        }
      )
      .subscribe((status) => {
        console.log('Tickets subscription status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('✅ Tickets subscription active');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Tickets subscription error');
        }
      });

    ticketsChannelRef.current = ticketsChannel;

    // Subscribe to message inserts - listen to all messages to update ticket/conversation list
    const messagesChannel = supabase
      .channel(messagesChannelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        async (payload) => {
          const newMessage = payload.new as Message;
          console.log('New message received:', newMessage.id, 'ticket:', newMessage.ticket_id, 'conversation:', newMessage.conversation_id);
          
          // Use refs to get current ticket/conversation (avoids stale closure)
          const currentTicket = currentTicketRef.current;
          const currentConv = currentConversationRef.current;
          
          // Check if message already exists OR if it's from current user (already added by sendMessage)
          setMessages((prev) => {
            if (prev.some(m => m.id === newMessage.id)) {
              return prev; // Already exists
            }
            
            // Skip adding if it's from current user (sendMessage already added it)
            if (newMessage.sender_id === userRole.userId) {
              return prev;
            }
            
            // If it's for the current ticket, add it
            if (currentTicket && newMessage.ticket_id === currentTicket.id) {
              return [...prev, newMessage];
            }
            
            // If it's for the current conversation, add it
            if (currentConv && newMessage.conversation_id === currentConv.id) {
              return [...prev, newMessage];
            }
            return prev;
          });
          
          // Update ticket's last_message_at in the list
          if (newMessage.ticket_id) {
            setTickets((prev) =>
              prev.map((t) =>
                t.id === newMessage.ticket_id
                  ? { 
                      ...t, 
                      last_message_at: newMessage.created_at,
                    }
                  : t
              )
            );
            
            // If it's for the current ticket, handle it
            if (currentTicket && newMessage.ticket_id === currentTicket.id) {
              // Auto-mark as read if we're viewing the ticket
              if (isAtBottomRef.current && newMessage.sender_id !== userRole.userId) {
                markMessagesAsRead(currentTicket.id, true).catch(console.error);
              }
            }
          }
          
          // Update conversation's last_message_at in the list
          if (newMessage.conversation_id) {
            setConversations((prev) =>
              prev.map((conv) =>
                conv.id === newMessage.conversation_id
                  ? { 
                      ...conv, 
                      last_message_at: newMessage.created_at,
                      // Increment unread count if message is not from current user
                      unread_count: newMessage.sender_id !== userRole.userId 
                        ? (conv.unread_count || 0) + 1 
                        : conv.unread_count
                    }
                  : conv
              )
            );
            
            // If it's for the current conversation, handle it
            if (currentConv && newMessage.conversation_id === currentConv.id) {
              // Auto-mark as read if we're viewing the conversation
              if (isAtBottomRef.current && newMessage.sender_id !== userRole.userId) {
                markMessagesAsRead(currentConv.id, false).catch(console.error);
              }
            }
          }
          
          // Show browser notification if tab is hidden and message is not from current user
          if (newMessage.sender_id !== userRole.userId && document.hidden && 'Notification' in window && Notification.permission === 'granted') {
            new Notification('New support message', {
              body: newMessage.content.substring(0, 100),
              icon: '/favicon.svg',
            });
          }

          // Update unread count for admins
          if (isAdmin) {
            const count = await getUnreadCount();
            setUnreadCount(count);
          }
        }
      )
      .subscribe((status) => {
        console.log('Messages subscription status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('✅ Messages subscription active');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Messages subscription error');
        }
      });

    messagesChannelRef.current = messagesChannel;

    // Subscribe to typing indicators for current conversation
    const typingChannel = supabase
      .channel(typingChannelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'typing_indicators',
        },
        async (payload) => {
          // Use ref to get current conversation (avoids stale closure)
          const currentConv = currentConversationRef.current;
          if (currentConv) {
            const { data } = await supabase
              .from('typing_indicators')
              .select('*')
              .eq('conversation_id', currentConv.id)
              .eq('is_typing', true)
              .neq('user_id', userRole.userId);

            setTypingIndicators(data || []);
          }
        }
      )
      .subscribe((status) => {
        console.log('Typing indicators subscription status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('✅ Typing indicators subscription active');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Typing indicators subscription error');
        }
      });

    typingChannelRef.current = typingChannel;

    return () => {
      console.log('Cleaning up real-time subscriptions');
      if (conversationsChannelRef.current) {
        supabase.removeChannel(conversationsChannelRef.current);
      }
      if (ticketsChannelRef.current) {
        supabase.removeChannel(ticketsChannelRef.current);
      }
      if (messagesChannelRef.current) {
        supabase.removeChannel(messagesChannelRef.current);
      }
      if (typingChannelRef.current) {
        supabase.removeChannel(typingChannelRef.current);
      }
      // Clear all typing timeouts
      typingTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
      typingTimeoutsRef.current.clear();
    };
  }, [userRole?.userId, isAdmin, getUnreadCount, markMessagesAsRead]); // Removed currentConversation and other callbacks from deps to prevent recreation

  // Presence heartbeat - updates typing indicator timestamp periodically when user is active
  useEffect(() => {
    if (!currentConversation || !userRole?.userId) {
      // Clear heartbeat if no conversation
      if (presenceHeartbeatRef.current) {
        clearInterval(presenceHeartbeatRef.current);
        presenceHeartbeatRef.current = null;
      }
      return;
    }

    // Update presence immediately
    const updatePresence = async () => {
      try {
        // Upsert with is_typing: false to update the timestamp without showing typing indicator
        await supabase
          .from('typing_indicators')
          .upsert(
            {
              conversation_id: currentConversation.id,
              user_id: userRole.userId,
              is_typing: false,
            },
            { onConflict: 'conversation_id,user_id' }
          );
      } catch (error) {
        console.error('Error updating presence heartbeat:', error);
      }
    };

    // Update presence immediately
    updatePresence();

    // Update presence every 20 seconds (heartbeat)
    presenceHeartbeatRef.current = setInterval(updatePresence, 20000);

    return () => {
      if (presenceHeartbeatRef.current) {
        clearInterval(presenceHeartbeatRef.current);
        presenceHeartbeatRef.current = null;
      }
    };
  }, [currentConversation?.id, userRole?.userId]);

  // Auto-select conversation for non-admin users (always select the single conversation)
  useEffect(() => {
    // Wait for userRole to be loaded before attempting to create/select conversations
    if (isLoadingUserRole) {
      console.log('Waiting for userRole to load...');
      return;
    }
    
    if (!isAdmin && userRole?.userId && !isLoadingConversations) {
      // If we have a conversation but it's not selected (or different), select it
      if (conversations.length > 0) {
        const conv = conversations[0];
        if (!currentConversation || conv.id !== currentConversation.id) {
          console.log('Auto-selecting conversation:', conv.id);
          setCurrentConversation(conv);
          currentConversationRef.current = conv;
          loadMessages(conv.id);
          markMessagesAsRead(conv.id);
        }
      }
      // If no conversation exists, create one
      else if (conversations.length === 0 && !currentConversation) {
        console.log('No conversation found, creating one...');
        getOrCreateConversation().then((conv) => {
          if (conv) {
            console.log('Conversation created/retrieved:', conv.id);
            // Add to conversations list if not already there (should be added by getOrCreateConversation, but ensure it)
            setConversations((prev) => {
              if (prev.some(c => c.id === conv.id)) {
                return prev;
              }
              return [conv, ...prev];
            });
            // Select the conversation immediately
            setCurrentConversation(conv);
            currentConversationRef.current = conv;
            loadMessages(conv.id);
            markMessagesAsRead(conv.id);
          } else {
            console.error('getOrCreateConversation returned null');
            // Retry after a short delay if creation failed
            setTimeout(() => {
              if (!currentConversation && conversations.length === 0) {
                console.log('Retrying conversation creation...');
                getOrCreateConversation().then((retryConv) => {
                  if (retryConv) {
                    setConversations((prev) => {
                      if (prev.some(c => c.id === retryConv.id)) {
                        return prev;
                      }
                      return [retryConv, ...prev];
                    });
                    setCurrentConversation(retryConv);
                    currentConversationRef.current = retryConv;
                    loadMessages(retryConv.id);
                    markMessagesAsRead(retryConv.id);
                  }
                });
              }
            }, 1000);
          }
        }).catch((error) => {
          console.error('Error in auto-select conversation:', error);
        });
      }
    }
  }, [isAdmin, userRole?.userId, conversations, currentConversation?.id, isLoadingConversations, isLoadingUserRole, getOrCreateConversation, loadMessages, markMessagesAsRead]);

  // Load tickets on mount (prioritize tickets over conversations)
  useEffect(() => {
    // Wait for userRole to be loaded
    if (isLoadingUserRole) {
      return;
    }
    
    if (userRole?.userId) {
      console.log('Loading tickets for user:', userRole.userId, 'isAdmin:', isAdmin);
      if (isAdmin) {
        loadAllTickets();
        getUnreadCount().then(setUnreadCount);
      } else {
        loadTickets();
      }
    }
  }, [userRole?.userId, isAdmin, isLoadingUserRole, loadTickets, loadAllTickets, getUnreadCount]);

  // Load conversations on mount (legacy, kept for backward compatibility)
  useEffect(() => {
    // Wait for userRole to be loaded
    if (isLoadingUserRole) {
      return;
    }
    
    if (userRole?.userId) {
      console.log('Loading conversations for user:', userRole.userId, 'isAdmin:', isAdmin);
      if (isAdmin) {
        loadAllConversations();
      } else {
        loadConversations();
      }
    }
  }, [userRole?.userId, isAdmin, isLoadingUserRole, loadConversations, loadAllConversations]);

  // Request notification permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const value: SupportContextType = {
    // Ticket state
    tickets: Array.isArray(tickets) ? tickets : [],
    currentTicket,
    isLoadingTickets,
    isLoadingMoreTickets,
    hasMoreTickets,
    // Conversation state (legacy)
    conversations,
    currentConversation,
    typingIndicators,
    isLoadingConversations,
    isLoadingMoreConversations,
    hasMoreConversations,
    // Shared state
    messages,
    isLoadingMessages,
    isLoadingMoreMessages,
    hasMoreMessages,
    unreadCount,
    isAdmin,
    // Ticket methods
    loadTickets,
    loadAllTickets,
    loadMoreTickets,
    createTicket,
    selectTicket,
    loadTicketMessages,
    sendTicketMessage,
    closeTicket,
    // Shared methods
    loadMessages,
    loadMoreMessages,
    sendMessage,
    editMessage,
    deleteMessage,
    markMessagesAsRead,
    getUnreadCount,
    // Conversation methods (legacy)
    loadConversations,
    loadAllConversations,
    loadMoreConversations,
    getOrCreateConversation,
    selectConversation,
    setTyping,
    updateConversationStatus,
    closeConversation,
    assignConversation,
    setPriority,
    addTag,
    removeTag,
    addAdminNote,
    getAdminNotes,
  };

  return <SupportContext.Provider value={value}>{children}</SupportContext.Provider>;
};

