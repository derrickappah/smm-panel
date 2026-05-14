import React, { useState } from 'react';
import { 
  useAdminReferrals, 
  useAdminReferralWallets, 
  useAdminReferralTransactions, 
  useUpdateReferralTxStatus,
  useReferralStats 
} from '@/hooks/useAdminReferrals';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  Search, 
  RefreshCw, 
  CheckCircle, 
  XCircle, 
  Clock, 
  UserPlus, 
  DollarSign, 
  Wallet,
  ArrowUpRight,
  TrendingUp
} from 'lucide-react';
import { toast } from 'sonner';

const AdminReferrals = () => {
  const { data: referrals = [], isLoading: loadingRefs, refetch: refetchRefs } = useAdminReferrals();
  const { data: wallets = [], isLoading: loadingWallets, refetch: refetchWallets } = useAdminReferralWallets();
  const { data: transactions = [], isLoading: loadingTxs, refetch: refetchTxs } = useAdminReferralTransactions();
  const { data: stats = { total_earned: 0, total_withdrawn: 0, pending_withdrawals: 0, total_wallets: 0 } } = useReferralStats();
  
  const updateStatus = useUpdateReferralTxStatus();
  
  const [searchTerm, setSearchTerm] = useState('');

  const handleUpdateStatus = async (txId, status) => {
    const action = status === 'completed' ? 'approve' : 'reject';
    if (!confirm(`Are you sure you want to ${action} this withdrawal request?`)) return;
    
    await updateStatus.mutateAsync({ txId, status });
  };

  const filteredTxs = transactions.filter(tx => 
    (tx.profiles?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (tx.profiles?.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (tx.type || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredWallets = wallets.filter(w => 
    (w.profiles?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (w.profiles?.email || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredReferrals = referrals.filter(r => 
    (r.referrer?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (r.referee?.name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fadeIn p-4 sm:p-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Referral Management</h1>
          <p className="text-gray-500 text-sm">Manage commissions, wallets, and withdrawal requests.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => {
              refetchRefs();
              refetchWallets();
              refetchTxs();
              toast.success('Data refreshed');
            }}
          >
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase font-semibold">Total Commission Paid</CardDescription>
            <CardTitle className="text-2xl flex items-center justify-between">
              ₵{stats.total_earned.toFixed(2)}
              <TrendingUp className="w-5 h-5 text-green-500" />
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase font-semibold">Total Withdrawn</CardDescription>
            <CardTitle className="text-2xl flex items-center justify-between">
              ₵{stats.total_withdrawn.toFixed(2)}
              <ArrowUpRight className="w-5 h-5 text-blue-500" />
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase font-semibold">Pending Withdrawals</CardDescription>
            <CardTitle className="text-2xl flex items-center justify-between text-orange-600">
              {stats.pending_withdrawals}
              <Clock className="w-5 h-5 text-orange-500" />
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase font-semibold">Total Referral Users</CardDescription>
            <CardTitle className="text-2xl flex items-center justify-between">
              {stats.total_wallets}
              <UserPlus className="w-5 h-5 text-purple-500" />
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
        <Input 
          placeholder="Search users, emails, or transaction types..." 
          className="pl-10 h-11"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <Tabs defaultValue="withdrawals" className="w-full">
        <TabsList className="grid w-full grid-cols-4 mb-8">
          <TabsTrigger value="withdrawals">Withdrawals</TabsTrigger>
          <TabsTrigger value="ledger">Ledger</TabsTrigger>
          <TabsTrigger value="wallets">User Wallets</TabsTrigger>
          <TabsTrigger value="relationships">Referrals</TabsTrigger>
        </TabsList>

        {/* Withdrawals Tab */}
        <TabsContent value="withdrawals">
          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Pending Withdrawal Requests</CardTitle>
              <CardDescription>Review and process cash-out requests.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Details</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTxs.filter(tx => tx.type === 'withdrawal' && tx.status === 'pending').map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell>
                          <div className="font-medium">{tx.profiles?.name || 'N/A'}</div>
                          <div className="text-xs text-gray-500">{tx.profiles?.email}</div>
                        </TableCell>
                        <TableCell className="font-bold text-red-600">
                          ₵{Math.abs(tx.amount).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-sm max-w-xs truncate">
                          {tx.description}
                        </TableCell>
                        <TableCell className="text-xs text-gray-500">
                          {new Date(tx.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button 
                              size="sm" 
                              variant="success"
                              className="h-8 text-xs bg-green-600 hover:bg-green-700"
                              onClick={() => handleUpdateStatus(tx.id, 'completed')}
                            >
                              <CheckCircle className="w-3 h-3 mr-1" /> Approve
                            </Button>
                            <Button 
                              size="sm" 
                              variant="destructive"
                              className="h-8 text-xs"
                              onClick={() => handleUpdateStatus(tx.id, 'failed')}
                            >
                              <XCircle className="w-3 h-3 mr-1" /> Reject
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredTxs.filter(tx => tx.type === 'withdrawal' && tx.status === 'pending').length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-12 text-gray-400">
                          No pending withdrawal requests found.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Ledger Tab */}
        <TabsContent value="ledger">
          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Referral Transaction Ledger</CardTitle>
              <CardDescription>Full history of all referral-related transactions.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTxs.slice(0, 50).map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell>
                        <div className="text-sm font-medium">{tx.profiles?.name || 'N/A'}</div>
                        <div className="text-[10px] text-gray-500">{tx.profiles?.email}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">{tx.type}</Badge>
                      </TableCell>
                      <TableCell className={tx.amount > 0 ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>
                        {tx.amount > 0 ? '+' : ''}₵{tx.amount.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={tx.status === 'completed' ? 'success' : tx.status === 'pending' ? 'warning' : 'destructive'}>
                          {tx.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs max-w-xs">{tx.description}</TableCell>
                      <TableCell className="text-[10px] text-gray-500">
                        {new Date(tx.created_at).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Wallets Tab */}
        <TabsContent value="wallets">
          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">User Referral Wallets</CardTitle>
              <CardDescription>Overview of balances and earnings per user.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Current Balance</TableHead>
                    <TableHead>Total Earned</TableHead>
                    <TableHead>Total Withdrawn</TableHead>
                    <TableHead>Last Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredWallets.map((w) => (
                    <TableRow key={w.user_id}>
                      <TableCell>
                        <div className="text-sm font-medium">{w.profiles?.name || 'N/A'}</div>
                        <div className="text-xs text-gray-500">{w.profiles?.email}</div>
                      </TableCell>
                      <TableCell className="font-bold">₵{w.balance.toFixed(2)}</TableCell>
                      <TableCell className="text-green-600">₵{w.total_earned.toFixed(2)}</TableCell>
                      <TableCell className="text-blue-600">₵{w.total_withdrawn.toFixed(2)}</TableCell>
                      <TableCell className="text-xs text-gray-500">
                        {new Date(w.updated_at).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Referrals Tab */}
        <TabsContent value="relationships">
          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Referral Relationships</CardTitle>
              <CardDescription>Tracking who referred whom.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Referrer</TableHead>
                    <TableHead>Referee</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredReferrals.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="text-sm font-medium">{r.referrer?.name || 'N/A'}</div>
                        <div className="text-xs text-gray-500">{r.referrer?.email}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-medium">{r.referee?.name || 'N/A'}</div>
                        <div className="text-xs text-gray-500">{r.referee?.email}</div>
                      </TableCell>
                      <TableCell className="text-xs text-gray-500">
                        {new Date(r.created_at).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminReferrals;
