import React, { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { 
  Card, CardContent, CardDescription, CardHeader, CardTitle 
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Loader2, RefreshCw, AlertTriangle, TrendingUp, TrendingDown, 
  Search, ArrowRight, CheckCircle, ShieldAlert, Coins, Percent, Play, Clock
} from 'lucide-react';

const AdminRateCatcher = () => {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('catalog');
  const [catalogItems, setCatalogItems] = useState([]);
  const [orderItems, setOrderItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Conversion Settings (default GHS to USD values)
  const [exchangeRate, setExchangeRate] = useState(15.0);
  const [markupPercent, setMarkupPercent] = useState(50.0);
  const [savingConfig, setSavingConfig] = useState(false);

  // Fetch settings from database on mount
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const { data, error } = await supabase
          .from('app_settings')
          .select('key, value')
          .in('key', ['rate_catcher_exchange_rate', 'rate_catcher_markup_percent']);
        
        if (error) throw error;
        
        if (data && data.length > 0) {
          data.forEach(item => {
            if (item.key === 'rate_catcher_exchange_rate') {
              setExchangeRate(parseFloat(item.value) || 15.0);
            } else if (item.key === 'rate_catcher_markup_percent') {
              setMarkupPercent(parseFloat(item.value) || 50.0);
            }
          });
        }
      } catch (err) {
        console.error('Failed to load settings:', err);
      }
    };
    fetchConfig();
  }, []);

  // Save configuration settings
  const saveConfig = async () => {
    setSavingConfig(true);
    try {
      const { error } = await supabase
        .from('app_settings')
        .upsert([
          { key: 'rate_catcher_exchange_rate', value: String(exchangeRate), description: 'Exchange rate used in Rate Change Catcher (USD to GHS)' },
          { key: 'rate_catcher_markup_percent', value: String(markupPercent), description: 'Default markup percentage used in Rate Change Catcher' }
        ], { onConflict: 'key' });

      if (error) throw error;
      toast.success('Configuration saved successfully');
    } catch (err) {
      toast.error(`Failed to save configuration: ${err.message}`);
    } finally {
      setSavingConfig(false);
    }
  };
  
  // Stats
  const [scanStats, setScanStats] = useState({
    checked: 0,
    mismatches: 0,
    profitRisks: 0,
  });

  // Fetch token and trigger scan
  const runCatalogScan = useCallback(async () => {
    setLoading(true);
    setCatalogItems([]);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch('/api/admin/rate-catcher', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ action: 'catalog' })
      });

      const resData = await response.json();
      if (!response.ok) throw new Error(resData.error || 'Failed to scan catalog');

      const items = resData.discrepancies || [];
      setCatalogItems(items);
      
      // Calculate catalog stats
      let mismatches = 0;
      let profitRisks = 0;
      
      items.forEach(item => {
        const expectedRate = item.live_rate * exchangeRate * (1 + markupPercent / 100);
        if (Math.abs(item.local_rate - expectedRate) > 0.05) {
          mismatches++;
        }
        if (expectedRate > item.local_rate) {
          profitRisks++;
        }
      });

      setScanStats({
        checked: items.length,
        mismatches,
        profitRisks,
      });

      toast.success(`Catalog scan complete. Analyzed ${items.length} services.`);
    } catch (error) {
      console.error(error);
      toast.error(error.message || 'Failed to run catalog scan');
    } finally {
      setLoading(false);
    }
  }, [exchangeRate, markupPercent]);

  const runOrderScan = useCallback(async () => {
    setLoading(true);
    setOrderItems([]);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch('/api/admin/rate-catcher', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ action: 'orders' })
      });

      const resData = await response.json();
      if (!response.ok) throw new Error(resData.error || 'Failed to audit orders');

      const items = resData.audits || [];
      setOrderItems(items);
      toast.success(`Order audit complete. Audited ${items.length} recent orders.`);
    } catch (error) {
      console.error(error);
      toast.error(error.message || 'Failed to audit orders');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'catalog') {
      runCatalogScan();
    } else {
      runOrderScan();
    }
  }, [activeTab]);

  // Quick Action to update the service rate in Supabase
  const updateServiceRate = async (serviceId, newRate, serviceName) => {
    try {
      const { error } = await supabase
        .from('services')
        .update({ rate: parseFloat(newRate.toFixed(2)) })
        .eq('id', serviceId);

      if (error) throw error;

      // Update local state
      setCatalogItems(prev => 
        prev.map(item => 
          item.service_id === serviceId 
            ? { ...item, local_rate: newRate } 
            : item
        )
      );

      // Recalculate stats
      setScanStats(prev => ({
        ...prev,
        mismatches: Math.max(0, prev.mismatches - 1)
      }));

      toast.success(`Successfully updated rate for "${serviceName}" to ${newRate.toFixed(2)} GHS`);
    } catch (error) {
      toast.error(`Failed to update rate: ${error.message}`);
    }
  };

  // Filter items
  const filteredCatalog = catalogItems.filter(item => 
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.provider.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 max-w-full overflow-hidden px-1">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-indigo-600" />
            Rate Change Catcher
          </h1>
          <p className="text-gray-500 text-sm">
            Audit and sync prices between providers and your local services database to prevent profit loss.
          </p>
        </div>
        <Button 
          onClick={activeTab === 'catalog' ? runCatalogScan : runOrderScan} 
          disabled={loading}
          className="bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-2 shadow-sm"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Run Audit Scan
        </Button>
      </div>

      {/* Configuration Settings */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-2 shadow-sm border-gray-200">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2 text-gray-700">
                <Coins className="w-5 h-5 text-indigo-500" />
                Audit Configuration
              </CardTitle>
              <CardDescription className="text-xs">
                Configure conversion parameters from provider rates (USD) to local rates (GHS).
              </CardDescription>
            </div>
            <Button 
              size="sm"
              onClick={saveConfig} 
              disabled={savingConfig}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-8 flex items-center gap-1.5"
            >
              {savingConfig ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
              Save Configuration
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="exRate" className="text-xs text-gray-600">USD to GHS Exchange Rate</Label>
                <div className="relative mt-1">
                  <Input 
                    id="exRate"
                    type="number" 
                    step="0.01"
                    value={exchangeRate} 
                    onChange={(e) => setExchangeRate(parseFloat(e.target.value) || 0)}
                    className="w-full text-sm pr-12"
                  />
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-xs text-gray-400">
                    GHS/$
                  </div>
                </div>
              </div>
              <div>
                <Label htmlFor="markup" className="text-xs text-gray-600">Default Profit Markup (%)</Label>
                <div className="relative mt-1">
                  <Input 
                    id="markup"
                    type="number" 
                    step="1"
                    value={markupPercent} 
                    onChange={(e) => setMarkupPercent(parseFloat(e.target.value) || 0)}
                    className="w-full text-sm pr-8"
                  />
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-xs text-gray-400">
                    %
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm bg-gradient-to-br from-indigo-50 to-blue-50 border-indigo-100">
          <CardContent className="pt-6">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-2xl font-bold text-indigo-900">{scanStats.checked}</p>
                <p className="text-[10px] text-indigo-600 uppercase font-bold tracking-wider">Checked</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-600">{scanStats.mismatches}</p>
                <p className="text-[10px] text-amber-600 uppercase font-bold tracking-wider">Discrepancies</p>
              </div>
              <div className="relative">
                <p className="text-2xl font-bold text-red-600">{scanStats.profitRisks}</p>
                <p className="text-[10px] text-red-600 uppercase font-bold tracking-wider">Profit Risks</p>
                {scanStats.profitRisks > 0 && (
                  <span className="absolute top-0 right-0 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="catalog" value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2 bg-gray-100 p-1 rounded-lg">
          <TabsTrigger value="catalog" className="rounded-md py-2 text-sm font-medium flex items-center justify-center gap-2">
            <Play className="w-4 h-4" />
            Catalog Audits
          </TabsTrigger>
          <TabsTrigger value="orders" className="rounded-md py-2 text-sm font-medium flex items-center justify-center gap-2">
            <Clock className="w-4 h-4" />
            Recent Order Audits
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Catalog Audit */}
        <TabsContent value="catalog" className="mt-4">
          <Card className="shadow-sm border-gray-200">
            <CardHeader className="pb-3 border-b border-gray-100">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <CardTitle className="text-base font-semibold">Catalog Price Differences</CardTitle>
                  <CardDescription className="text-xs">
                    Compares current local rates (GHS) vs. live provider rates (USD) converted at current exchange configuration.
                  </CardDescription>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                  <Input
                    type="search"
                    placeholder="Search services..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8 text-sm w-full h-9 bg-white"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                  <p className="text-sm text-gray-500">Fetching live rates from SMM provider APIs...</p>
                </div>
              ) : filteredCatalog.length === 0 ? (
                <div className="text-center py-12 text-gray-500 text-sm">
                  No catalog items found. Run audit scan to check provider connections.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50/50 text-xs font-semibold text-gray-600 border-b border-gray-100">
                        <th className="p-4">Service Details</th>
                        <th className="p-4">Provider</th>
                        <th className="p-4 text-right">Local Rate (GHS)</th>
                        <th className="p-4 text-right">Live Rate (USD)</th>
                        <th className="p-4 text-right">Expected (GHS)</th>
                        <th className="p-4">Status & Diff</th>
                        <th className="p-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-sm">
                      {filteredCatalog.map((item, idx) => {
                        const expectedRate = item.live_rate * exchangeRate * (1 + markupPercent / 100);
                        const rateDiff = item.local_rate - expectedRate;
                        const percentDiff = expectedRate > 0 ? (rateDiff / expectedRate) * 100 : 0;
                        const isUnderpriced = expectedRate > item.local_rate;
                        const isSignificant = Math.abs(rateDiff) > 0.05;

                        return (
                          <tr key={idx} className={`hover:bg-gray-50/50 transition-colors ${!item.enabled ? 'opacity-60 bg-gray-50/20' : ''}`}>
                            <td className="p-4 max-w-xs">
                              <p className="font-semibold text-gray-900 truncate">{item.name}</p>
                              <span className="text-[10px] text-gray-400 font-mono">ID: {item.service_id.slice(0, 8)}...</span>
                            </td>
                            <td className="p-4">
                              <span className="capitalize px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                                {item.provider}
                              </span>
                              <p className="text-[10px] text-gray-400 font-mono mt-0.5">PID: {item.provider_service_id}</p>
                            </td>
                            <td className="p-4 text-right font-mono font-medium">{item.local_rate.toFixed(2)}</td>
                            <td className="p-4 text-right font-mono text-gray-500">${item.live_rate.toFixed(3)}</td>
                            <td className="p-4 text-right font-mono font-bold text-indigo-700">{expectedRate.toFixed(2)}</td>
                            <td className="p-4">
                              {isSignificant ? (
                                isUnderpriced ? (
                                  <div className="flex items-center gap-1.5 text-red-600 font-medium text-xs">
                                    <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                                    <span>Profit Loss ({percentDiff.toFixed(0)}%)</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1.5 text-emerald-600 font-medium text-xs">
                                    <TrendingUp className="w-4 h-4 text-emerald-500 shrink-0" />
                                    <span>Extra Margin (+{Math.abs(percentDiff).toFixed(0)}%)</span>
                                  </div>
                                )
                              ) : (
                                <div className="flex items-center gap-1.5 text-gray-500 text-xs">
                                  <CheckCircle className="w-4 h-4 text-gray-400 shrink-0" />
                                  <span>In Sync</span>
                                </div>
                              )}
                            </td>
                            <td className="p-4 text-right">
                              {isSignificant && (
                                <Button
                                  size="sm"
                                  onClick={() => updateServiceRate(item.service_id, expectedRate, item.name)}
                                  className="h-8 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 hover:text-indigo-800 text-xs border border-indigo-200"
                                >
                                  Sync Rate
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Recent Order Audit */}
        <TabsContent value="orders" className="mt-4">
          <Card className="shadow-sm border-gray-200">
            <CardHeader className="pb-3 border-b border-gray-100">
              <CardTitle className="text-base font-semibold">Audited Billed Orders</CardTitle>
              <CardDescription className="text-xs">
                Audits the actual cost billed by providers on recent orders vs. our local rates to confirm margins.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                  <p className="text-sm text-gray-500">Querying order charges from SMM API status endpoints...</p>
                </div>
              ) : orderItems.length === 0 ? (
                <div className="text-center py-12 text-gray-500 text-sm">
                  No orders checked yet. Click Run Audit Scan above.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50/50 text-xs font-semibold text-gray-600 border-b border-gray-100">
                        <th className="p-4">Order details</th>
                        <th className="p-4 text-right">Quantity</th>
                        <th className="p-4 text-right">Billed Cost (USD)</th>
                        <th className="p-4 text-right">Billed Rate (USD/1k)</th>
                        <th className="p-4 text-right">Local Rate (GHS)</th>
                        <th className="p-4 text-right">Local Cost (GHS)</th>
                        <th className="p-4">Margin Check</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-sm">
                      {orderItems.map((order, idx) => {
                        // Compute billed cost in local GHS
                        const billedCostGHS = order.provider_charge * exchangeRate;
                        const netProfitGHS = order.local_cost_charged - billedCostGHS;
                        const isLoss = netProfitGHS < 0;

                        return (
                          <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                            <td className="p-4">
                              <p className="font-semibold text-gray-900 truncate max-w-xs">{order.service_name}</p>
                              <div className="flex gap-2 text-[10px] text-gray-400 mt-0.5">
                                <span className="font-mono">OID: {order.order_id.slice(0, 8)}...</span>
                                <span>|</span>
                                <span className="capitalize">{order.provider} (ID: {order.provider_order_id})</span>
                              </div>
                            </td>
                            <td className="p-4 text-right font-mono font-medium">{order.quantity.toLocaleString()}</td>
                            <td className="p-4 text-right font-mono text-gray-600">${order.provider_charge.toFixed(3)}</td>
                            <td className="p-4 text-right font-mono text-gray-500">${order.provider_billed_rate.toFixed(3)}</td>
                            <td className="p-4 text-right font-mono">{order.local_service_rate ? `${order.local_service_rate.toFixed(2)}` : 'N/A'}</td>
                            <td className="p-4 text-right font-mono font-medium">{order.local_cost_charged.toFixed(2)} GHS</td>
                            <td className="p-4">
                              {isLoss ? (
                                <div className="flex items-center gap-1.5 text-red-600 font-bold text-xs bg-red-50 border border-red-200 px-2.5 py-1 rounded w-fit">
                                  <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                                  <span>Loss: {netProfitGHS.toFixed(2)} GHS</span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5 text-emerald-700 font-semibold text-xs bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded w-fit">
                                  <TrendingUp className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                  <span>Margin: +{netProfitGHS.toFixed(2)} GHS</span>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminRateCatcher;
