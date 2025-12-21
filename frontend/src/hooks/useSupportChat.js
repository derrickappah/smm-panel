import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

// Fetch chat messages for a ticket
const fetchChatMessages = async (ticketId) => {
  const { data, error } = await supabase
    .from('support_chat_messages')
    .select('id, ticket_id, sender_id, sender_type, message, read, created_at, profiles(name, email)')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });

  if (error) {
    if (error.code === '42P01') {
      console.warn('Support chat table may not exist. Run CREATE_SUPPORT_CHAT.sql migration.');
      return [];
    }
    throw error;
  }

  return data || [];
};

// Send a chat message
const sendChatMessage = async ({ ticketId, message, senderType }) => {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('User not authenticated');
  }

  const { data, error } = await supabase
    .from('support_chat_messages')
    .insert({
      ticket_id: ticketId,
      sender_id: user.id,
      sender_type: senderType,
      message: message.trim(),
      read: false
    })
    .select()
    .single();

  if (error) throw error;
  return data;
};

// Mark messages as read
const markMessagesAsRead = async (ticketId, senderType) => {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) return;

  // Mark messages as read where sender is not the current user
  const { error } = await supabase
    .from('support_chat_messages')
    .update({ read: true })
    .eq('ticket_id', ticketId)
    .neq('sender_type', senderType);

  if (error) throw error;
};

export const useSupportChat = (ticketId) => {
  const queryClient = useQueryClient();
  const [isSubscribed, setIsSubscribed] = useState(false);

  // Fetch messages
  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['support_chat', ticketId],
    queryFn: () => fetchChatMessages(ticketId),
    enabled: !!ticketId,
    staleTime: 0, // Always fetch fresh for chat
  });

  // Send message mutation
  const sendMessage = useMutation({
    mutationFn: sendChatMessage,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support_chat', ticketId] });
    },
    onError: (error) => {
      toast.error('Failed to send message: ' + (error.message || 'Unknown error'));
    },
  });

  // Mark as read mutation
  const markAsRead = useMutation({
    mutationFn: ({ ticketId, senderType }) => markMessagesAsRead(ticketId, senderType),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support_chat', ticketId] });
    },
  });

  // Subscribe to real-time updates
  useEffect(() => {
    if (!ticketId || isSubscribed) return;

    const channel = supabase
      .channel(`support_chat_${ticketId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'support_chat_messages',
          filter: `ticket_id=eq.${ticketId}`
        },
        () => {
          // Refetch messages when new ones arrive
          queryClient.invalidateQueries({ queryKey: ['support_chat', ticketId] });
        }
      )
      .subscribe();

    setIsSubscribed(true);

    return () => {
      supabase.removeChannel(channel);
      setIsSubscribed(false);
    };
  }, [ticketId, isSubscribed, queryClient]);

  return {
    messages,
    isLoading,
    sendMessage: (message, senderType) => sendMessage.mutateAsync({ ticketId, message, senderType }),
    markAsRead: (senderType) => markAsRead.mutate({ ticketId, senderType }),
    isSending: sendMessage.isPending,
  };
};



