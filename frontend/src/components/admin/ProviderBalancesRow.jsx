import React, { useState, useEffect, useCallback, memo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { 
  Wallet, RefreshCw, AlertTriangle, CheckCircle2, 
  XCircle, ExternalLink, HelpCircle, ArrowUpRight 
} from 'lucide-react';
import { toast } from 'sonner';

const ProviderBalancesRow = memo(({ onSectionChange }) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchBalances = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      const url = `/api/admin/provider-balances${isManualRefresh ? '?refresh=true' : ''}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${response.status}`);
      }

      const result = await response.json();
      setData(result);
      setLastUpdated(new Date());

      if (isManualRefresh) {
        toast.success('Provider balances updated');
      }
    } catch (err) {
      console.error('[ProviderBalancesRow] Fetch error:', err);
      setError(err.message || 'Failed to load balances');
      if (isManualRefresh) {
        toast.error(`Failed to refresh: ${err.message}`);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchBalances(false);
  }, [fetchBalances]);

  const handleCardClick = (tab) => {
    if (onSectionChange && tab) {
      onSectionChange(tab);
    }
  };

  const formatUSD = (val) => {
    if (val === null || val === undefined) return '--';
    return `$${Number(val).toFixed(2)}`;
  };

  const formatGHS = (val) => {
    if (val === null || val === undefined) return '--';
    return `₵${Number(val).toFixed(2)}`;
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3.5 sm:p-4 shadow-sm hover:shadow-md transition-shadow duration-200">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
            <Wallet className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-bold text-gray-900">External SMM Provider Balances</h3>
              {data?.totals?.lowBalanceCount > 0 && (
                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 text-[10px] px-1.5 py-0">
                  <AlertTriangle className="w-2.5 h-2.5 mr-1 text-amber-600" />
                  {data.totals.lowBalanceCount} Low Balance
                </Badge>
              )}
            </div>
            <p className="text-[11px] sm:text-xs text-gray-500">
              Total Funds:{' '}
              <span className="font-semibold text-gray-900">
                {data?.totals?.totalUSD !== undefined ? formatUSD(data.totals.totalUSD) : '...'} USD
              </span>
              {' '}(≈{' '}
              <span className="font-semibold text-emerald-600">
                {data?.totals?.totalGHS !== undefined ? formatGHS(data.totals.totalGHS) : '...'} GHS
              </span>
              )
              {data?.exchangeRate ? ` · Rate: ₵${data.exchangeRate.toFixed(2)}/$` : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {lastUpdated && (
            <span className="hidden sm:inline-block text-[10px] text-gray-400">
              Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchBalances(true)}
            disabled={refreshing || loading}
            className="h-8 px-2.5 text-xs text-gray-700 hover:text-indigo-600 hover:border-indigo-200"
            title="Refresh all provider balances"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${refreshing ? 'animate-spin text-indigo-600' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Provider cards grid */}
      <div className="pt-3">
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
              <div key={i} className="h-20 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : error && !data ? (
          <div className="flex items-center justify-between p-3 bg-red-50 text-red-700 rounded-lg text-xs">
            <span className="flex items-center gap-2">
              <XCircle className="w-4 h-4 text-red-500" />
              Failed to load provider balances: {error}
            </span>
            <Button size="sm" variant="ghost" onClick={() => fetchBalances(true)} className="h-7 text-xs text-red-700">
              Retry
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-2">
            {(data?.providers || []).map((p) => {
              const isLow = p.isLow;
              const isError = p.status === 'error';
              const isNotConfigured = p.status === 'not_configured';

              return (
                <div
                  key={p.id}
                  onClick={() => handleCardClick(p.tab)}
                  className={`group relative rounded-lg p-2.5 border transition-all duration-150 cursor-pointer select-none ${
                    isLow
                      ? 'bg-amber-50/60 border-amber-200 hover:border-amber-400 hover:shadow-sm'
                      : isError
                      ? 'bg-red-50/40 border-red-200 hover:border-red-300'
                      : isNotConfigured
                      ? 'bg-gray-50 border-gray-200 hover:border-gray-300 opacity-75'
                      : 'bg-white border-gray-200 hover:border-indigo-300 hover:shadow-sm'
                  }`}
                >
                  {/* Top row: Name & Status indicator */}
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="text-[11px] font-semibold text-gray-800 truncate" title={p.name}>
                      {p.name}
                    </span>
                    <ArrowUpRight className="w-3 h-3 text-gray-300 group-hover:text-indigo-600 transition-colors flex-shrink-0" />
                  </div>

                  {/* USD Balance */}
                  <div className="flex items-baseline gap-1">
                    <span className={`text-xs sm:text-sm font-bold tracking-tight ${
                      isLow ? 'text-amber-800' : isError ? 'text-red-600' : 'text-gray-900'
                    }`}>
                      {isNotConfigured ? 'Not set' : isError ? 'Error' : formatUSD(p.balance)}
                    </span>
                    {!isError && !isNotConfigured && (
                      <span className="text-[9px] text-gray-400 uppercase">USD</span>
                    )}
                  </div>

                  {/* Converted GHS Balance */}
                  <div className="mt-0.5 flex items-center justify-between">
                    <span className="text-[10px] text-emerald-600 font-medium">
                      {isNotConfigured || isError ? (
                        <span className="text-gray-400 text-[9px]">{p.error || 'Setup required'}</span>
                      ) : (
                        `≈ ${formatGHS(p.balanceGHS)}`
                      )}
                    </span>
                  </div>

                  {/* Low balance pill */}
                  {isLow && (
                    <div className="mt-1">
                      <span className="inline-block px-1 py-0.2 text-[8px] font-semibold text-amber-700 bg-amber-100 rounded">
                        Low &lt; $5
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});

export default ProviderBalancesRow;
