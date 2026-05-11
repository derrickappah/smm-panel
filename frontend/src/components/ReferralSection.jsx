import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { 
  Copy, 
  Users, 
  DollarSign, 
  UserPlus, 
  CheckCircle, 
  Clock, 
  Gift, 
  ArrowRightLeft, 
  Wallet,
  History,
  AlertCircle
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const ReferralSection = ({ user }) => {
  const [referralCode, setReferralCode] = useState('');
  const [referrals, setReferrals] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [wallet, setWallet] = useState({
    balance: 0,
    total_earned: 0,
    total_withdrawn: 0
  });
  const [loading, setLoading] = useState(true);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [transferAmount, setTransferAmount] = useState('');
  const [withdrawalAmount, setWithdrawalAmount] = useState('');
  const [withdrawalDetails, setWithdrawalDetails] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (user) {
      fetchReferralData();
    }
  }, [user]);

  const fetchReferralData = async () => {
    try {
      setLoading(true);

      // 1. Fetch user's referral code
      const { data: profile } = await supabase
        .from('profiles')
        .select('referral_code')
        .eq('id', user.id)
        .single();
      
      if (profile?.referral_code) {
        setReferralCode(profile.referral_code);
      }

      // 2. Fetch referral wallet
      const { data: walletData } = await supabase
        .from('referral_wallets')
        .select('*')
        .eq('user_id', user.id)
        .single();
      
      if (walletData) {
        setWallet(walletData);
      }

      // 3. Fetch referrals list
      const { data: referralsData } = await supabase
        .from('referrals')
        .select('*, profiles:referee_id(name, email, created_at)')
        .eq('referrer_id', user.id)
        .order('created_at', { ascending: false });
      
      if (referralsData) {
        setReferrals(referralsData);
      }

      // 4. Fetch referral transactions
      const { data: transData } = await supabase
        .from('referral_transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (transData) {
        setTransactions(transData);
      }

    } catch (error) {
      console.error('Error fetching referral data:', error);
      toast.error('Failed to load referral data');
    } finally {
      setLoading(false);
    }
  };

  const handleTransfer = async () => {
    const amount = parseFloat(transferAmount);
    if (isNaN(amount) || amount < 0.1) {
      toast.error('Minimum transfer amount is GHS 0.1');
      return;
    }


    try {
      setActionLoading(true);
      const { data, error } = await supabase.rpc('transfer_referral_to_main_wallet', {
        p_amount: amount
      });

      if (error) throw error;

      if (data.success) {
        toast.success(data.message);
        setIsTransferModalOpen(false);
        setTransferAmount('');
        fetchReferralData();
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      toast.error(error.message || 'Transfer failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleWithdrawal = async () => {
    const amount = parseFloat(withdrawalAmount);
    if (isNaN(amount) || amount < 5) {
      toast.error('Minimum withdrawal amount is GHS 5');
      return;
    }


    if (!withdrawalDetails.trim()) {
      toast.error('Please provide payment details');
      return;
    }

    try {
      setActionLoading(true);
      const { data, error } = await supabase.rpc('request_referral_withdrawal', {
        p_amount: amount,
        p_details: withdrawalDetails
      });

      if (error) throw error;

      if (data.success) {
        toast.success(data.message);
        setIsWithdrawModalOpen(false);
        setWithdrawalAmount('');
        setWithdrawalDetails('');
        fetchReferralData();
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      toast.error(error.message || 'Withdrawal request failed');
    } finally {
      setActionLoading(false);
    }
  };

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text).then(() => {
      toast.success(`${label} copied!`);
    });
  };

  const getReferralLink = () => {
    return `${window.location.origin}/auth?ref=${referralCode}`;
  };

  if (loading) {
    return <div className="flex justify-center p-12"><Clock className="animate-spin" /></div>;
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Referral Code and Link Section */}
      <Card className="border-none shadow-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-white">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gift className="w-6 h-6" />
            Invite & Earn
          </CardTitle>
          <CardDescription className="text-indigo-100 text-lg">
            Share your link and earn 5% commission on every deposit your referrals make!
          </CardDescription>
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-indigo-100">Your Referral Code</Label>
            <div className="flex gap-2">
              <Input
                value={referralCode}
                readOnly
                className="bg-white/10 border-white/20 text-white font-mono h-12"
              />
              <Button
                onClick={() => copyToClipboard(referralCode, 'Code')}
                variant="secondary"
                className="h-12"
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-indigo-100">Your Referral Link</Label>
            <div className="flex gap-2">
              <Input
                value={getReferralLink()}
                readOnly
                className="bg-white/10 border-white/20 text-white font-mono h-12 text-sm"
              />
              <Button
                onClick={() => copyToClipboard(getReferralLink(), 'Link')}
                variant="secondary"
                className="h-12"
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats and Wallet Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-none shadow-md overflow-hidden">
          <div className="p-6 flex flex-col h-full bg-white">
            <div className="flex items-center justify-between mb-4">
              <div className="bg-green-100 p-3 rounded-full">
                <Wallet className="w-6 h-6 text-green-600" />
              </div>
              <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">Available</Badge>
            </div>
            <p className="text-gray-600 text-sm font-medium">Referral Balance</p>
            <h2 className="text-3xl font-bold text-gray-900 mt-1">₵{parseFloat(wallet.balance).toFixed(2)}</h2>
            <div className="grid grid-cols-2 gap-2 mt-auto pt-6">
              <Button 
                onClick={() => setIsTransferModalOpen(true)}
                className="bg-indigo-600 hover:bg-indigo-700 text-xs"
              >
                <ArrowRightLeft className="w-3 h-3 mr-1" /> Transfer
              </Button>
              <Button 
                onClick={() => setIsWithdrawModalOpen(true)}
                variant="outline"
                className="text-xs"
              >
                <DollarSign className="w-3 h-3 mr-1" /> Withdraw
              </Button>
            </div>
          </div>
        </Card>

        <Card className="border-none shadow-md">
          <div className="p-6">
            <div className="bg-blue-100 p-3 rounded-full w-fit mb-4">
              <History className="w-6 h-6 text-blue-600" />
            </div>
            <p className="text-gray-600 text-sm font-medium">Total Lifetime Earnings</p>
            <h2 className="text-3xl font-bold text-gray-900 mt-1">₵{parseFloat(wallet.total_earned).toFixed(2)}</h2>
            <p className="text-xs text-gray-500 mt-4 flex items-center gap-1">
              <CheckCircle className="w-3 h-3 text-green-500" /> All-time commissions
            </p>
          </div>
        </Card>

        <Card className="border-none shadow-md">
          <div className="p-6">
            <div className="bg-purple-100 p-3 rounded-full w-fit mb-4">
              <Users className="w-6 h-6 text-purple-600" />
            </div>
            <p className="text-gray-600 text-sm font-medium">Total Referrals</p>
            <h2 className="text-3xl font-bold text-gray-900 mt-1">{referrals.length}</h2>
            <p className="text-xs text-gray-500 mt-4 flex items-center gap-1">
              <UserPlus className="w-3 h-3 text-purple-500" /> Successful invites
            </p>
          </div>
        </Card>
      </div>

      {/* Transactions & Referrals Tabs */}
      <div className="grid lg:grid-cols-5 gap-6">
        <Card className="lg:col-span-3 border-none shadow-md">
          <CardHeader>
            <CardTitle className="text-lg">Recent Ledger</CardTitle>
            <CardDescription>Commissions, transfers and withdrawals</CardDescription>
          </CardHeader>
          <CardContent>
            {transactions.length === 0 ? (
              <div className="text-center py-12 text-gray-400">No transactions found</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell>
                          <span className="capitalize font-medium">{tx.type}</span>
                        </TableCell>
                        <TableCell className={tx.amount > 0 ? 'text-green-600' : 'text-red-600'}>
                          {tx.amount > 0 ? '+' : ''}₵{Math.abs(tx.amount).toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={tx.status === 'completed' ? 'success' : tx.status === 'pending' ? 'warning' : 'destructive'}>
                            {tx.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-gray-500">
                          {new Date(tx.created_at).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 border-none shadow-md">
          <CardHeader>
            <CardTitle className="text-lg">Your Referrals</CardTitle>
            <CardDescription>People who joined using your code</CardDescription>
          </CardHeader>
          <CardContent>
            {referrals.length === 0 ? (
              <div className="text-center py-12 text-gray-400">No referrals yet</div>
            ) : (
              <div className="space-y-4">
                {referrals.map((ref) => (
                  <div key={ref.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold">
                        {ref.profiles?.name?.charAt(0) || 'U'}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{ref.profiles?.name || 'User'}</p>
                        <p className="text-xs text-gray-500">{new Date(ref.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                    {ref.bonus_awarded ? (
                      <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Active</Badge>
                    ) : (
                      <Badge variant="secondary">Pending</Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Transfer Modal */}
      <Dialog open={isTransferModalOpen} onOpenChange={setIsTransferModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transfer to Main Wallet</DialogTitle>
            <DialogDescription>
              Move funds from your referral balance to your main account balance for purchases.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Amount (Min GHS 0.1)</Label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-gray-500">₵</span>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  className="pl-7"
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(e.target.value)}
                />
              </div>
              <p className="text-xs text-gray-500">Available: ₵{parseFloat(wallet.balance).toFixed(2)}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsTransferModalOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleTransfer} 
              disabled={actionLoading || !transferAmount || parseFloat(transferAmount) < 0.1}
              className="bg-indigo-600 hover:bg-indigo-700"
            >

              {actionLoading ? 'Processing...' : 'Transfer Now'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Withdrawal Modal */}
      <Dialog open={isWithdrawModalOpen} onOpenChange={setIsWithdrawModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Withdraw Funds</DialogTitle>
            <DialogDescription>
              Request a direct cash out to your Mobile Money or Bank account.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Amount (Min GHS 5)</Label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-gray-500">₵</span>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  className="pl-7"
                  value={withdrawalAmount}
                  onChange={(e) => setWithdrawalAmount(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Payment Details</Label>
              <Input
                placeholder="MTN Momo: 024XXXXXXX (John Doe)"
                value={withdrawalDetails}
                onChange={(e) => setWithdrawalDetails(e.target.value)}
              />
              <p className="text-[10px] text-gray-500 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> Withdrawal requests are processed within 24 hours.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsWithdrawModalOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleWithdrawal} 
              disabled={actionLoading || !withdrawalAmount || parseFloat(withdrawalAmount) < 5 || !withdrawalDetails}
              className="bg-indigo-600 hover:bg-indigo-700"
            >

              {actionLoading ? 'Submitting...' : 'Submit Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ReferralSection;
