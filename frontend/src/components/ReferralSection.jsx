import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Copy, Users, DollarSign, UserPlus, CheckCircle, Clock, Gift } from 'lucide-react';

const ReferralSection = ({ user }) => {
  const [referralCode, setReferralCode] = useState('');
  const [referrals, setReferrals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalReferrals: 0,
    totalEarnings: 0,
    pendingBonuses: 0,
  });

  useEffect(() => {
    if (user) {
      fetchReferralData();
      
      // If no referral code found, set up polling to check again
      // This handles cases where code is being generated
      if (!referralCode) {
        const pollInterval = setInterval(() => {
          fetchReferralData();
        }, 2000); // Check every 2 seconds
        
        // Stop polling after 30 seconds or when code is found
        const timeout = setTimeout(() => {
          clearInterval(pollInterval);
        }, 30000);
        
        return () => {
          clearInterval(pollInterval);
          clearTimeout(timeout);
        };
      }
    }
  }, [user, referralCode]);

  const fetchReferralData = async () => {
    try {
      setLoading(true);

      // Fetch user's referral code from profile
      // Also fetch full profile to ensure we have latest data
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('referral_code, created_at')
        .eq('id', user.id)
        .single();

      if (profileError) {
        console.error('Error fetching referral code:', profileError);
      } else if (profile) {
        const code = profile.referral_code || '';
        setReferralCode(code);
        
        // If user was just created (within last 5 minutes) and no code, keep polling
        if (!code && profile.created_at) {
          const createdTime = new Date(profile.created_at).getTime();
          const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
          if (createdTime > fiveMinutesAgo) {
            // User is new, code might still be generating
            console.log('New user detected, code may still be generating...');
          }
        }
      }

      // Fetch referrals where this user is the referrer
      const { data: referralsData, error: referralsError } = await supabase
        .from('referrals')
        .select('id, referrer_id, referee_id, referral_bonus, bonus_awarded, first_deposit_amount, created_at')
        .eq('referrer_id', user.id)
        .order('created_at', { ascending: false });

      if (referralsError) {
        console.error('Error fetching referrals:', referralsError);
        // Show user-friendly error message
        if (referralsError.code === 'PGRST301' || referralsError.message?.includes('permission') || referralsError.message?.includes('RLS')) {
          console.warn('RLS policy may be blocking referral access. This is normal if you have no referrals yet.');
          // Don't show error toast for RLS issues - just set empty array
        } else if (referralsError.code === '42P01') {
          console.warn('Referrals table does not exist yet.');
          toast.error('Referrals feature not set up yet. Please contact admin.');
        } else {
          toast.error('Failed to fetch referrals: ' + (referralsError.message || 'Unknown error'));
        }
        setReferrals([]);
        setStats({
          totalReferrals: 0,
          totalEarnings: 0,
          pendingBonuses: 0,
        });
        return;
      } else if (referralsData && referralsData.length > 0) {
        // Fetch referee profiles separately
        const refereeIds = referralsData.map(ref => ref.referee_id);
        
        const { data: refereeProfiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, email, name, created_at')
          .in('id', refereeIds);

        if (profilesError) {
          console.error('Error fetching referee profiles:', profilesError);
          // If RLS blocks, try fetching one by one or use admin client
        }

        // Combine referral data with referee profiles
        const referralsWithProfiles = referralsData.map(referral => {
          const refereeProfile = refereeProfiles?.find(p => p.id === referral.referee_id);
          
          // Extract name - use email prefix if name is null/empty
          let displayName = 'User';
          if (refereeProfile) {
            if (refereeProfile.name && refereeProfile.name.trim()) {
              displayName = refereeProfile.name.trim();
            } else if (refereeProfile.email) {
              displayName = refereeProfile.email.split('@')[0];
            }
          }
          
          return {
            ...referral,
            referee: {
              id: referral.referee_id,
              email: refereeProfile?.email || '',
              name: displayName,
              created_at: refereeProfile?.created_at || referral.created_at,
            },
          };
        });

        setReferrals(referralsWithProfiles);

        // Calculate stats
        const totalReferrals = referralsWithProfiles.length;
        const totalEarnings = referralsWithProfiles.reduce((sum, ref) => {
          return sum + (parseFloat(ref.referral_bonus) || 0);
        }, 0);
        const pendingBonuses = referralsWithProfiles.filter(ref => !ref.bonus_awarded).length;

        setStats({
          totalReferrals,
          totalEarnings,
          pendingBonuses,
        });
      } else {
        setReferrals([]);
        setStats({
          totalReferrals: 0,
          totalEarnings: 0,
          pendingBonuses: 0,
        });
      }
    } catch (error) {
      console.error('Error fetching referral data:', error);
      toast.error('Failed to load referral data');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text).then(() => {
      toast.success(`${label} copied to clipboard!`);
    }).catch(() => {
      toast.error('Failed to copy to clipboard');
    });
  };

  const getReferralLink = () => {
    if (!referralCode) return '';
    return `${window.location.origin}/auth?ref=${referralCode}`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Referral Program</CardTitle>
          <CardDescription>Loading referral information...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Referral Code and Link Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gift className="w-5 h-5" />
            Your Referral Code
          </CardTitle>
          <CardDescription>
            Share your referral link and earn 10% of your referrals' first deposit
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {referralCode ? (
            <>
              <div>
                <Label className="text-sm font-medium text-gray-700 mb-2 block">
                  Your Referral Code
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={referralCode}
                    readOnly
                    className="font-mono font-semibold"
                  />
                  <Button
                    onClick={() => copyToClipboard(referralCode, 'Referral code')}
                    variant="outline"
                    size="icon"
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium text-gray-700 mb-2 block">
                  Your Referral Link
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={getReferralLink()}
                    readOnly
                    className="font-mono text-sm"
                  />
                  <Button
                    onClick={() => copyToClipboard(getReferralLink(), 'Referral link')}
                    variant="outline"
                    size="icon"
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">
                Your referral code is being generated. This may take a moment.
              </p>
              <Button
                onClick={fetchReferralData}
                variant="outline"
                size="sm"
                className="w-full"
              >
                Refresh Referral Code
              </Button>
              <p className="text-xs text-gray-400">
                If this persists, please run GENERATE_CODES_AND_FIX.sql in Supabase SQL Editor to generate codes for all users.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats Section */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Referrals</p>
                <p className="text-2xl font-bold text-gray-900">{stats.totalReferrals}</p>
              </div>
              <Users className="w-8 h-8 text-indigo-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Earnings</p>
                <p className="text-2xl font-bold text-gray-900">
                  ₵{stats.totalEarnings.toFixed(2)}
                </p>
              </div>
              <DollarSign className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-2 md:col-span-1">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Pending Bonuses</p>
                <p className="text-2xl font-bold text-gray-900">{stats.pendingBonuses}</p>
              </div>
              <Clock className="w-8 h-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Referred Users List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5" />
            Your Referrals
          </CardTitle>
          <CardDescription>
            People you've referred and their deposit status
          </CardDescription>
        </CardHeader>
        <CardContent>
          {referrals.length === 0 ? (
            <div className="text-center py-8">
              <UserPlus className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">No referrals yet</p>
              <p className="text-sm text-gray-400 mt-2">
                Share your referral link to start earning!
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {referrals.map((referral) => {
                const referee = referral.referee;
                return (
                  <div
                    key={referral.id}
                    className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                          <span className="text-indigo-600 font-semibold">
                            {referee?.name?.charAt(0)?.toUpperCase() || 
                             referee?.email?.charAt(0)?.toUpperCase() || 
                             '?'}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">
                            {referee?.name || 
                             (referee?.email ? referee.email.split('@')[0] : null) || 
                             'User'}
                          </p>
                          {referee?.email ? (
                            <p className="text-sm text-gray-500">{referee.email}</p>
                          ) : (
                            <p className="text-sm text-gray-400 italic">Email not available</p>
                          )}
                          <p className="text-xs text-gray-400">
                            Joined: {formatDate(referee?.created_at || referral?.created_at)}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      {referral.bonus_awarded ? (
                        <div className="flex items-center gap-2 text-green-600">
                          <CheckCircle className="w-4 h-4" />
                          <div>
                            <p className="text-sm font-medium">Bonus Awarded</p>
                            <p className="text-xs">₵{parseFloat(referral.referral_bonus || 0).toFixed(2)}</p>
                          </div>
                        </div>
                      ) : referral.first_deposit_amount ? (
                        <div className="flex items-center gap-2 text-yellow-600">
                          <Clock className="w-4 h-4" />
                          <div>
                            <p className="text-sm font-medium">Pending</p>
                            <p className="text-xs">Deposit: ₵{parseFloat(referral.first_deposit_amount || 0).toFixed(2)}</p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-gray-400">
                          <Clock className="w-4 h-4" />
                          <div>
                            <p className="text-sm font-medium">No Deposit Yet</p>
                            <p className="text-xs">Waiting for first deposit</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ReferralSection;

