import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useUserRole } from './useUserRole';
import { toast } from 'sonner';

// 1. Fetch all referral relationships
const fetchReferrals = async () => {
  const { data: referralsData, error } = await supabase
    .from('referrals')
    .select('*, referrer:referrer_id(name, email), referee:referee_id(name, email)')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return referralsData || [];
};

// 2. Fetch all referral wallets
const fetchReferralWallets = async () => {
  const { data, error } = await supabase
    .from('referral_wallets')
    .select('*, profiles:user_id(name, email)')
    .order('balance', { ascending: false });

  if (error) throw error;
  return data || [];
};

// 3. Fetch all referral transactions
const fetchReferralTransactions = async () => {
  const { data, error } = await supabase
    .from('referral_transactions')
    .select('*, profiles:user_id(name, email)')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
};

export const useAdminReferrals = () => {
  const { data: userRole } = useUserRole();
  return useQuery({
    queryKey: ['admin', 'referrals'],
    queryFn: fetchReferrals,
    enabled: !!userRole?.isAdmin,
  });
};

export const useAdminReferralWallets = () => {
  const { data: userRole } = useUserRole();
  return useQuery({
    queryKey: ['admin', 'referral-wallets'],
    queryFn: fetchReferralWallets,
    enabled: !!userRole?.isAdmin,
  });
};

export const useAdminReferralTransactions = () => {
  const { data: userRole } = useUserRole();
  return useQuery({
    queryKey: ['admin', 'referral-transactions'],
    queryFn: fetchReferralTransactions,
    enabled: !!userRole?.isAdmin,
  });
};

export const useUpdateReferralTxStatus = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ txId, status }) => {
      const { data, error } = await supabase.rpc('update_referral_transaction_status', {
        p_tx_id: txId,
        p_status: status
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data.success) {
        toast.success(data.message);
        queryClient.invalidateQueries({ queryKey: ['admin', 'referral-transactions'] });
        queryClient.invalidateQueries({ queryKey: ['admin', 'referral-wallets'] });
      } else {
        toast.error(data.message);
      }
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update status');
    }
  });
};

// Keep existing hooks if they are still needed for some pages, but marked for deprecation
export const useReferralStats = () => {
  return useQuery({
    queryKey: ['admin', 'referrals', 'stats'],
    queryFn: async () => {
      const wallets = await fetchReferralWallets();
      const txs = await fetchReferralTransactions();
      
      const totalEarned = wallets.reduce((sum, w) => sum + (parseFloat(w.total_earned) || 0), 0);
      const totalWithdrawn = wallets.reduce((sum, w) => sum + (parseFloat(w.total_withdrawn) || 0), 0);
      const pendingWithdrawals = txs.filter(t => t.type === 'withdrawal' && t.status === 'pending').length;

      return {
        total_earned: totalEarned,
        total_withdrawn: totalWithdrawn,
        pending_withdrawals: pendingWithdrawals,
        total_wallets: wallets.length
      };
    }
  });
};
