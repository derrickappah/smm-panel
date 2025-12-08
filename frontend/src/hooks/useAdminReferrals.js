import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

// Fetch all referrals with profiles
const fetchReferrals = async () => {
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

  const { data: referralsData, error: referralsError } = await supabase
    .from('referrals')
    .select('id, referrer_id, referee_id, referral_bonus, bonus_awarded, bonus_awarded_at, first_deposit_amount, created_at')
    .order('created_at', { ascending: false });

  if (referralsError) {
    if (referralsError.code === '42P01') {
      return [];
    }
    throw referralsError;
  }

  if (!referralsData || referralsData.length === 0) {
    return [];
  }

  // Fetch referrer and referee profiles
  const referrerIds = [...new Set(referralsData.map(ref => ref.referrer_id))];
  const refereeIds = [...new Set(referralsData.map(ref => ref.referee_id))];
  const allUserIds = [...new Set([...referrerIds, ...refereeIds])];

  const { data: profilesData, error: profilesError } = await supabase
    .from('profiles')
    .select('id, name, email')
    .in('id', allUserIds);

  if (profilesError) {
    console.error('Error fetching profiles:', profilesError);
  }

  // Combine referral data with profiles
  const referralsWithProfiles = referralsData.map(referral => {
    const referrerProfile = profilesData?.find(p => p.id === referral.referrer_id);
    const refereeProfile = profilesData?.find(p => p.id === referral.referee_id);
    return {
      ...referral,
      referrer: referrerProfile || { id: referral.referrer_id, name: null, email: null },
      referee: refereeProfile || { id: referral.referee_id, name: null, email: null }
    };
  });

  return referralsWithProfiles;
};

export const useAdminReferrals = (options = {}) => {
  const { enabled = true } = options;

  return useQuery({
    queryKey: ['admin', 'referrals'],
    queryFn: fetchReferrals,
    enabled,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useReferralStats = () => {
  return useQuery({
    queryKey: ['admin', 'referrals', 'stats'],
    queryFn: async () => {
      const referrals = await fetchReferrals();
      
      const totalReferrals = referrals.length;
      const totalBonusesPaid = referrals.reduce((sum, ref) => {
        return sum + (ref.bonus_awarded ? (parseFloat(ref.referral_bonus) || 0) : 0);
      }, 0);
      const pendingBonuses = referrals.filter(ref => {
        return !ref.bonus_awarded && ref.first_deposit_amount;
      }).length;
      const totalBonusAmount = referrals.reduce((sum, ref) => {
        return sum + (parseFloat(ref.referral_bonus) || 0);
      }, 0);

      return {
        total_referrals: totalReferrals,
        total_bonuses_paid: totalBonusesPaid,
        pending_bonuses: pendingBonuses,
        total_bonus_amount: totalBonusAmount
      };
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });
};

export const useAwardReferralBonus = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ referralId, referral }) => {
      // If first_deposit_amount is missing, use the database function
      if (!referral.first_deposit_amount) {
        const { data, error } = await supabase.rpc('process_referral_bonus_manual', {
          p_user_id: referral.referee_id,
          p_transaction_id: null
        });

        if (error) throw error;
        if (!data || !data.success) {
          throw new Error(data?.error || 'Failed to process bonus');
        }

        return data;
      }

      // Original logic for when first_deposit_amount exists
      const bonusAmount = parseFloat(referral.referral_bonus) || (parseFloat(referral.first_deposit_amount) * 0.1);

      // Update referral record
      const { error: updateError } = await supabase
        .from('referrals')
        .update({
          bonus_awarded: true,
          bonus_awarded_at: new Date().toISOString(),
          referral_bonus: bonusAmount
        })
        .eq('id', referralId);

      if (updateError) throw updateError;

      // Get referrer's current balance
      const { data: referrerProfile, error: profileError } = await supabase
        .from('profiles')
        .select('balance')
        .eq('id', referral.referrer_id)
        .single();

      if (profileError) throw profileError;

      // Update referrer's balance
      const newBalance = (parseFloat(referrerProfile.balance) || 0) + bonusAmount;
      const { error: balanceError } = await supabase
        .from('profiles')
        .update({ balance: newBalance })
        .eq('id', referral.referrer_id);

      if (balanceError) throw balanceError;

      // Create transaction record for the bonus
      await supabase
        .from('transactions')
        .insert({
          user_id: referral.referrer_id,
          amount: bonusAmount,
          type: 'deposit',
          status: 'approved'
        });

      return { success: true, bonus_amount: bonusAmount };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'referrals'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast.success('Bonus awarded successfully!');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to award bonus');
    },
  });
};

export const useProcessAllMissedBonuses = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('process_all_missed_referral_bonuses');

      if (error) throw error;
      if (!data || !data.success) {
        throw new Error('Failed to process missed bonuses');
      }

      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'referrals'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast.success(
        `Processed ${data.processed_count} bonus(es) successfully. ` +
        (data.error_count > 0 ? `${data.error_count} error(s) occurred.` : '')
      );
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to process missed bonuses');
    },
  });
};

