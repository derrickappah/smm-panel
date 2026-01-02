import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useUserRole } from './useUserRole';
import { toast } from 'sonner';

// Fetch all user details including deposits, orders, transactions, and totals
const fetchUserDetails = async (userId) => {
  if (!userId) {
    throw new Error('User ID is required');
  }

  // Fetch user profile
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, email, name, balance, role, phone_number, created_at')
    .eq('id', userId)
    .single();

  if (profileError) {
    if (profileError.code === '42501' || profileError.message?.includes('permission') || profileError.message?.includes('policy')) {
      toast.error('RLS Policy Error: Cannot view user details. Please check your permissions.');
    }
    throw profileError;
  }

  // Fetch deposits (all deposit transactions)
  const { data: deposits, error: depositsError } = await supabase
    .from('transactions')
    .select('id, amount, type, status, created_at, deposit_method, paystack_reference, manual_reference, korapay_reference, moolre_reference, payment_proof_url')
    .eq('user_id', userId)
    .eq('type', 'deposit')
    .order('created_at', { ascending: false });

  if (depositsError) {
    console.error('Error fetching deposits:', depositsError);
    // Don't throw, just log - we can still show other data
  }

  // Fetch orders with service details
  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('id, service_id, promotion_package_id, link, quantity, total_cost, status, created_at, completed_at, smmgen_order_id, smmcost_order_id, services(name, platform, service_type), promotion_packages(name, platform, service_type)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (ordersError) {
    console.error('Error fetching orders:', ordersError);
    // Don't throw, just log - we can still show other data
  }

  // Fetch all transactions (deposits, orders, refunds)
  const { data: transactions, error: transactionsError } = await supabase
    .from('transactions')
    .select('id, amount, type, status, created_at, deposit_method, paystack_reference, manual_reference, korapay_reference, moolre_reference, order_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (transactionsError) {
    console.error('Error fetching transactions:', transactionsError);
    // Don't throw, just log - we can still show other data
  }

  // Calculate totals
  const totalDeposits = (deposits || [])
    .filter(t => t.status === 'approved')
    .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);

  const totalOrdersPrice = (orders || [])
    .filter(o => o.status === 'completed')
    .reduce((sum, o) => sum + parseFloat(o.total_cost || 0), 0);

  return {
    profile: profile || null,
    deposits: deposits || [],
    orders: orders || [],
    transactions: transactions || [],
    totals: {
      deposits: totalDeposits,
      orders: totalOrdersPrice,
      balance: parseFloat(profile?.balance || 0),
    },
  };
};

export const useUserDetails = (userId, options = {}) => {
  const { enabled = true } = options;
  
  // Check role at hook level (cached)
  const { data: userRole, isLoading: roleLoading } = useUserRole();
  const isAdmin = userRole?.isAdmin ?? false;
  
  // Only enable queries if user is admin and userId is provided
  const queryEnabled = enabled && !roleLoading && isAdmin && !!userId;

  return useQuery({
    queryKey: ['admin', 'user-details', userId],
    queryFn: () => fetchUserDetails(userId),
    enabled: queryEnabled,
    staleTime: 1 * 60 * 1000, // 1 minute - user details can change frequently
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
};
