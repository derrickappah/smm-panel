import { QueryClient } from '@tanstack/react-query';
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

// Create a query client with optimized defaults for admin dashboard
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes - data is fresh for 5 minutes
      gcTime: 24 * 60 * 60 * 1000, // 24 hours - keep in cache much longer for persistence
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

// Configure persistence to localStorage
if (typeof window !== 'undefined') {
  const localStoragePersister = createSyncStoragePersister({
    storage: window.localStorage,
  });

  persistQueryClient({
    queryClient,
    persister: localStoragePersister,
    maxAge: 1000 * 60 * 60 * 24, // 24 hours
    buster: 'v2', // Cache buster to invalidate old cache
    dehydrateOptions: {
      shouldDehydrateQuery: (query) => {
        // Exclude admin queries from persistence to prevent showing stale data on refresh
        return !query.queryKey.includes('admin');
      },
    },
  });
}


