import { QueryClient } from '@tanstack/react-query';

// Create a query client with optimized defaults for admin dashboard
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes - data is fresh for 5 minutes
      gcTime: 30 * 60 * 1000, // 30 minutes - keep in cache longer (increased from 10)
      refetchOnWindowFocus: false, // Don't refetch on window focus
      refetchOnReconnect: true, // Refetch on reconnect
      refetchOnMount: true, // Refetch on mount (but use cached data if fresh)
      retry: 1, // Only retry once on failure
      retryDelay: 1000, // Wait 1 second before retry
      // Enable background refetching for better UX
      networkMode: 'online',
    },
    mutations: {
      retry: 1, // Retry mutations once on failure
      retryDelay: 1000,
      networkMode: 'online',
    },
  },
});


