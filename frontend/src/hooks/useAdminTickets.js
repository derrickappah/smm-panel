import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { checkUserRole } from './useUserRole';
import { toast } from 'sonner';

const PAGE_SIZE = 50;

// Fetch tickets with pagination
const fetchTickets = async ({ pageParam = 0 }) => {
  const userRole = await checkUserRole();
  
  if (!userRole.isAdmin) {
    throw new Error('Access denied. Admin role required.');
  }

  const from = pageParam * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, error, count } = await supabase
    .from('support_tickets')
    .select('*, profiles(name, email)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    if (error.code === '42P01') {
      console.warn('Support tickets table may not exist. Run CREATE_SUPPORT_TICKETS.sql migration.');
      return { data: [], nextPage: undefined, total: 0 };
    }
    throw error;
  }

  return {
    data: data || [],
    nextPage: data && data.length === PAGE_SIZE ? pageParam + 1 : undefined,
    total: count || 0,
  };
};

// Fetch all tickets (for stats calculation) - Optimized with limit
// Only fetch what's needed for stats, not all records
const fetchAllTickets = async () => {
  const userRole = await checkUserRole();
  
  if (!userRole.isAdmin) {
    throw new Error('Access denied. Admin role required.');
  }

  // For stats, we typically only need recent tickets or aggregated data
  // Limit to last 5000 tickets instead of fetching everything
  const { data, error } = await supabase
    .from('support_tickets')
    .select('*, profiles(name, email)')
    .order('created_at', { ascending: false })
    .limit(5000);

  if (error) {
    if (error.code === '42P01') {
      console.warn('Support tickets table may not exist. Run CREATE_SUPPORT_TICKETS.sql migration.');
      return [];
    }
    throw error;
  }

  return data || [];
};

export const useAdminTickets = (options = {}) => {
  const { enabled = true, useInfinite = false } = options;

  if (useInfinite) {
    return useInfiniteQuery({
      queryKey: ['admin', 'tickets'],
      queryFn: fetchTickets,
      getNextPageParam: (lastPage) => lastPage.nextPage,
      initialPageParam: 0,
      enabled,
      staleTime: 1 * 60 * 1000, // 1 minute
      gcTime: 3 * 60 * 1000, // 3 minutes
    });
  }

  return useQuery({
    queryKey: ['admin', 'tickets', 'all'],
    queryFn: fetchAllTickets,
    enabled,
    staleTime: 2 * 60 * 1000, // 2 minutes - increased for better caching
    gcTime: 5 * 60 * 1000, // 5 minutes - keep in cache longer
  });
};

export const useUpdateTicket = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ ticketId, updates }) => {
      const { data, error } = await supabase
        .from('support_tickets')
        .update(updates)
        .eq('id', ticketId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'tickets'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      toast.success('Ticket updated successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update ticket');
    },
  });
};

export const useReplyToTicket = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ ticketId, message }) => {
      const { data, error } = await supabase
        .from('support_tickets')
        .update({ 
          admin_response: message,
          status: 'in_progress'
        })
        .eq('id', ticketId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'tickets'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      toast.success('Response added and sent to user!');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to send reply');
    },
  });
};


