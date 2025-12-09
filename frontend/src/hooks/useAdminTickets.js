import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

const PAGE_SIZE = 50;

// Fetch tickets with pagination
const fetchTickets = async ({ pageParam = 0 }) => {
  const { data: currentUser } = await supabase.auth.getUser();
  if (!currentUser?.user) {
    throw new Error('Not authenticated');
  }

  const { data: userProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', currentUser.user.id)
    .single();

  if (userProfile?.role !== 'admin') {
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

// Fetch all tickets (for stats calculation)
const fetchAllTickets = async () => {
  const { data: currentUser } = await supabase.auth.getUser();
  if (!currentUser?.user) {
    throw new Error('Not authenticated');
  }

  const { data: userProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', currentUser.user.id)
    .single();

  if (userProfile?.role !== 'admin') {
    throw new Error('Access denied. Admin role required.');
  }

  let allRecords = [];
  let from = 0;
  let hasMore = true;
  const batchSize = 1000;
  const maxIterations = 10000; // Safety limit to prevent infinite loops
  let iterations = 0;

  while (hasMore && iterations < maxIterations) {
    iterations++;
    const to = from + batchSize - 1;
    
    try {
      const { data, error } = await supabase
        .from('support_tickets')
        .select('*, profiles(name, email)')
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) {
        // Handle case where table doesn't exist
        if (error.code === '42P01') {
          console.warn('Support tickets table may not exist. Run CREATE_SUPPORT_TICKETS.sql migration.');
          return [];
        }
        console.error(`Error fetching tickets batch (from ${from} to ${to}):`, error);
        throw error;
      }

      if (data && data.length > 0) {
        allRecords = [...allRecords, ...data];
        // Continue if we got a full batch, stop if we got less
        hasMore = data.length === batchSize;
        from = to + 1;
      } else {
        // No more data
        hasMore = false;
      }
    } catch (error) {
      console.error('Error in fetchAllTickets batch:', error);
      // If we have some records, return them rather than failing completely
      if (allRecords.length > 0) {
        console.warn(`Returning partial ticket data (${allRecords.length} records) due to error`);
        return allRecords;
      }
      // Re-throw if it's the table doesn't exist error (already handled above)
      if (error.code === '42P01') {
        return [];
      }
      throw error;
    }
  }

  if (iterations >= maxIterations) {
    console.warn(`fetchAllTickets reached max iterations (${maxIterations}), returning ${allRecords.length} records`);
  }

  return allRecords;
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
    staleTime: 1 * 60 * 1000,
    gcTime: 3 * 60 * 1000,
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


