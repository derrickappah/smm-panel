import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useUserRole } from './useUserRole';
import { toast } from 'sonner';

const PAGE_SIZE = 50;

// Fetch tickets with pagination
const fetchTickets = async ({ pageParam = 0 }) => {
  const from = pageParam * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, error, count } = await supabase
    .from('support_tickets')
    .select('id, user_id, name, email, order_id, message, status, category, created_at, updated_at, admin_response, profiles!support_tickets_user_id_fkey(name, email)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    if (error.code === '42P01') {
      console.warn('Support tickets table may not exist. Run CREATE_SUPPORT_TICKETS.sql migration.');
      return { data: [], nextPage: undefined, total: 0 };
    }
    console.error('Error fetching tickets:', error);
    throw error;
  }

  return {
    data: data || [],
    nextPage: data && data.length === PAGE_SIZE ? pageParam + 1 : undefined,
    total: count || 0,
  };
};

// Fetch all tickets (for stats calculation) - Fetches ALL records efficiently using optimized pagination
const fetchAllTickets = async () => {
  const BATCH_SIZE = 1000; // Fetch in batches for optimal performance
  let allTickets = [];
  let from = 0;
  let hasMore = true;
  
  // First, get total count to optimize fetching
  const { count, error: countError } = await supabase
    .from('support_tickets')
    .select('*', { count: 'exact', head: true });
  
    if (countError) {
      if (countError.code === '42P01') {
        console.warn('Support tickets table may not exist. Run CREATE_SUPPORT_TICKETS.sql migration.');
        return [];
      }
      console.error('Error counting tickets:', countError);
      throw countError;
    }

  // Fetch all batches - optimized sequential fetching for large datasets
  while (hasMore) {
    const to = from + BATCH_SIZE - 1;
    
    const { data, error } = await supabase
      .from('support_tickets')
      .select('id, user_id, name, email, order_id, message, status, category, created_at, updated_at, admin_response, profiles!support_tickets_user_id_fkey(name, email)')
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      if (error.code === '42P01') {
        console.warn('Support tickets table may not exist. Run CREATE_SUPPORT_TICKETS.sql migration.');
        return [];
      }
      console.error('Error fetching tickets batch:', error);
      throw error;
    }

    if (data && data.length > 0) {
      allTickets = allTickets.concat(data);
      hasMore = data.length === BATCH_SIZE && allTickets.length < (count || Infinity);
      from += BATCH_SIZE;
    } else {
      hasMore = false;
    }
  }

  return allTickets;
};

export const useAdminTickets = (options = {}) => {
  const { enabled = true, useInfinite = false } = options;
  
  // Check role at hook level (cached)
  const { data: userRole, isLoading: roleLoading } = useUserRole();
  const isAdmin = userRole?.isAdmin ?? false;
  
  // Only enable queries if user is admin
  const queryEnabled = enabled && !roleLoading && isAdmin;

  if (useInfinite) {
    return useInfiniteQuery({
      queryKey: ['admin', 'tickets'],
      queryFn: fetchTickets,
      getNextPageParam: (lastPage) => lastPage.nextPage,
      initialPageParam: 0,
      enabled: queryEnabled,
      staleTime: 1 * 60 * 1000, // 1 minute
      gcTime: 3 * 60 * 1000, // 3 minutes
    });
  }

  return useQuery({
    queryKey: ['admin', 'tickets', 'all'],
    queryFn: fetchAllTickets,
    enabled: queryEnabled,
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
        .select('*, profiles!support_tickets_user_id_fkey(name, email)')
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


