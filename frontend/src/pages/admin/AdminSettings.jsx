import React, { memo, useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RefreshCw, Power, PowerOff, CheckCircle, Wallet } from 'lucide-react';
import { toast } from 'sonner';

const AdminSettings = memo(() => {
  const queryClient = useQueryClient();
  const [paymentMethodSettings, setPaymentMethodSettings] = useState({
    paystack_enabled: true,
    manual_enabled: true,
    hubtel_enabled: true,
    korapay_enabled: true
  });
  const [minDepositSettings, setMinDepositSettings] = useState({
    paystack_min: 10,
    manual_min: 10,
    hubtel_min: 1,
    korapay_min: 1
  });

  // Fetch payment method settings
  const { data: settingsData, isLoading, refetch } = useQuery({
    queryKey: ['admin', 'payment-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', [
          'payment_method_paystack_enabled',
          'payment_method_manual_enabled',
          'payment_method_hubtel_enabled',
          'payment_method_korapay_enabled',
          'payment_method_paystack_min_deposit',
          'payment_method_manual_min_deposit',
          'payment_method_hubtel_min_deposit',
          'payment_method_korapay_min_deposit'
        ]);

      if (error) throw error;

      const settings = {};
      data?.forEach(item => {
        if (item.key.includes('_enabled')) {
          const method = item.key.replace('payment_method_', '').replace('_enabled', '');
          settings[`${method}_enabled`] = item.value === 'true';
        } else if (item.key.includes('_min_deposit')) {
          const method = item.key.replace('payment_method_', '').replace('_min_deposit', '');
          settings[`${method}_min`] = parseFloat(item.value) || 0;
        }
      });

      return settings;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  useEffect(() => {
    if (settingsData) {
      setPaymentMethodSettings(prev => ({
        ...prev,
        paystack_enabled: settingsData.paystack_enabled ?? prev.paystack_enabled,
        manual_enabled: settingsData.manual_enabled ?? prev.manual_enabled,
        hubtel_enabled: settingsData.hubtel_enabled ?? prev.hubtel_enabled,
        korapay_enabled: settingsData.korapay_enabled ?? prev.korapay_enabled,
      }));
      setMinDepositSettings(prev => ({
        ...prev,
        paystack_min: settingsData.paystack_min ?? prev.paystack_min,
        manual_min: settingsData.manual_min ?? prev.manual_min,
        hubtel_min: settingsData.hubtel_min ?? prev.hubtel_min,
        korapay_min: settingsData.korapay_min ?? prev.korapay_min,
      }));
    }
  }, [settingsData]);

  const togglePaymentMethod = useMutation({
    mutationFn: async ({ method, enabled }) => {
      let settingKey, description, stateKey, displayName;
      
      if (method === 'paystack') {
        settingKey = 'payment_method_paystack_enabled';
        description = 'Enable/disable Paystack payment method';
        stateKey = 'paystack_enabled';
        displayName = 'Paystack';
      } else if (method === 'manual') {
        settingKey = 'payment_method_manual_enabled';
        description = 'Enable/disable Manual (Mobile Money) payment method';
        stateKey = 'manual_enabled';
        displayName = 'Manual';
      } else if (method === 'hubtel') {
        settingKey = 'payment_method_hubtel_enabled';
        description = 'Enable/disable Hubtel payment method';
        stateKey = 'hubtel_enabled';
        displayName = 'Hubtel';
      } else if (method === 'korapay') {
        settingKey = 'payment_method_korapay_enabled';
        description = 'Enable/disable Korapay payment method';
        stateKey = 'korapay_enabled';
        displayName = 'Korapay';
      } else {
        throw new Error('Unknown payment method');
      }
      
      const { error } = await supabase
        .from('app_settings')
        .upsert({
          key: settingKey,
          value: enabled ? 'true' : 'false',
          description: description
        }, {
          onConflict: 'key'
        });

      if (error) throw error;
      return { stateKey, enabled, displayName };
    },
    onSuccess: ({ stateKey, enabled, displayName }) => {
      setPaymentMethodSettings(prev => ({
        ...prev,
        [stateKey]: enabled
      }));
      queryClient.invalidateQueries({ queryKey: ['admin', 'payment-settings'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      toast.success(`${displayName} payment method ${enabled ? 'enabled' : 'disabled'}`);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update payment method setting');
    },
  });

  const updateMinDeposit = useMutation({
    mutationFn: async ({ method, minAmount }) => {
      const amount = parseFloat(minAmount);
      if (isNaN(amount) || amount <= 0) {
        throw new Error('Minimum deposit must be a positive number');
      }

      let settingKey, description, stateKey, displayName;
      
      if (method === 'paystack') {
        settingKey = 'payment_method_paystack_min_deposit';
        description = 'Minimum deposit amount for Paystack payment method';
        stateKey = 'paystack_min';
        displayName = 'Paystack';
      } else if (method === 'manual') {
        settingKey = 'payment_method_manual_min_deposit';
        description = 'Minimum deposit amount for Manual (Mobile Money) payment method';
        stateKey = 'manual_min';
        displayName = 'Manual';
      } else if (method === 'hubtel') {
        settingKey = 'payment_method_hubtel_min_deposit';
        description = 'Minimum deposit amount for Hubtel payment method';
        stateKey = 'hubtel_min';
        displayName = 'Hubtel';
      } else if (method === 'korapay') {
        settingKey = 'payment_method_korapay_min_deposit';
        description = 'Minimum deposit amount for Korapay payment method';
        stateKey = 'korapay_min';
        displayName = 'Korapay';
      } else {
        throw new Error('Unknown payment method');
      }
      
      const { error } = await supabase
        .from('app_settings')
        .upsert({
          key: settingKey,
          value: amount.toString(),
          description: description
        }, {
          onConflict: 'key'
        });

      if (error) throw error;
      return { stateKey, amount, displayName };
    },
    onSuccess: ({ stateKey, amount, displayName }) => {
      setMinDepositSettings(prev => ({
        ...prev,
        [stateKey]: amount
      }));
      queryClient.invalidateQueries({ queryKey: ['admin', 'payment-settings'] });
      toast.success(`${displayName} minimum deposit updated to ₵${amount}`);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update minimum deposit setting');
    },
  });

  const handleTogglePaymentMethod = useCallback((method, enabled) => {
    togglePaymentMethod.mutate({ method, enabled });
  }, [togglePaymentMethod]);

  const handleUpdateMinDeposit = useCallback((method, value) => {
    updateMinDeposit.mutate({ method, minAmount: value });
  }, [updateMinDeposit]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Payment Methods</h2>
          <p className="text-gray-600 mt-1">Enable or disable payment methods for users</p>
        </div>
        <Button
          onClick={() => refetch()}
          disabled={isLoading}
          variant="outline"
          size="sm"
          className="flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Payment Methods Settings */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-8 shadow-sm">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6">Available Payment Methods</h2>
        <div className="space-y-4">
          {/* Paystack */}
          <div className="flex items-center justify-between p-4 bg-white/50 rounded-xl border-2 border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Paystack</p>
                <p className="text-sm text-gray-600">Online payment gateway</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Label htmlFor="paystack-min" className="text-sm text-gray-700 whitespace-nowrap">Min: ₵</Label>
                <Input
                  id="paystack-min"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={minDepositSettings.paystack_min}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '' || parseFloat(value) >= 0) {
                      setMinDepositSettings(prev => ({ ...prev, paystack_min: value }));
                    }
                  }}
                  onBlur={(e) => {
                    const value = parseFloat(e.target.value);
                    if (!isNaN(value) && value > 0) {
                      handleUpdateMinDeposit('paystack', value);
                    }
                  }}
                  className="w-20 h-9 text-sm"
                />
              </div>
              <Button
                onClick={() => handleTogglePaymentMethod('paystack', !paymentMethodSettings.paystack_enabled)}
                variant={paymentMethodSettings.paystack_enabled ? "default" : "outline"}
                size="sm"
                disabled={togglePaymentMethod.isPending}
                className={paymentMethodSettings.paystack_enabled ? "bg-green-600 hover:bg-green-700" : ""}
              >
                {paymentMethodSettings.paystack_enabled ? (
                  <>
                    <Power className="w-4 h-4 mr-2" />
                    Enabled
                  </>
                ) : (
                  <>
                    <PowerOff className="w-4 h-4 mr-2" />
                    Disabled
                  </>
                )}
              </Button>
            </div>
          </div>
          
          {/* Manual */}
          <div className="flex items-center justify-between p-4 bg-white/50 rounded-xl border-2 border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-lg flex items-center justify-center">
                <Wallet className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Manual (Mobile Money)</p>
                <p className="text-sm text-gray-600">MTN Mobile Money payment</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Label htmlFor="manual-min" className="text-sm text-gray-700 whitespace-nowrap">Min: ₵</Label>
                <Input
                  id="manual-min"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={minDepositSettings.manual_min}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '' || parseFloat(value) >= 0) {
                      setMinDepositSettings(prev => ({ ...prev, manual_min: value }));
                    }
                  }}
                  onBlur={(e) => {
                    const value = parseFloat(e.target.value);
                    if (!isNaN(value) && value > 0) {
                      handleUpdateMinDeposit('manual', value);
                    }
                  }}
                  className="w-20 h-9 text-sm"
                />
              </div>
              <Button
                onClick={() => handleTogglePaymentMethod('manual', !paymentMethodSettings.manual_enabled)}
                variant={paymentMethodSettings.manual_enabled ? "default" : "outline"}
                size="sm"
                disabled={togglePaymentMethod.isPending}
                className={paymentMethodSettings.manual_enabled ? "bg-green-600 hover:bg-green-700" : ""}
              >
                {paymentMethodSettings.manual_enabled ? (
                  <>
                    <Power className="w-4 h-4 mr-2" />
                    Enabled
                  </>
                ) : (
                  <>
                    <PowerOff className="w-4 h-4 mr-2" />
                    Disabled
                  </>
                )}
              </Button>
            </div>
          </div>
          
          {/* Hubtel */}
          <div className="flex items-center justify-between p-4 bg-white/50 rounded-xl border-2 border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-600 rounded-lg flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Hubtel</p>
                <p className="text-sm text-gray-600">Hubtel payment gateway</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Label htmlFor="hubtel-min" className="text-sm text-gray-700 whitespace-nowrap">Min: ₵</Label>
                <Input
                  id="hubtel-min"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={minDepositSettings.hubtel_min}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '' || parseFloat(value) >= 0) {
                      setMinDepositSettings(prev => ({ ...prev, hubtel_min: value }));
                    }
                  }}
                  onBlur={(e) => {
                    const value = parseFloat(e.target.value);
                    if (!isNaN(value) && value > 0) {
                      handleUpdateMinDeposit('hubtel', value);
                    }
                  }}
                  className="w-20 h-9 text-sm"
                />
              </div>
              <Button
                onClick={() => handleTogglePaymentMethod('hubtel', !paymentMethodSettings.hubtel_enabled)}
                variant={paymentMethodSettings.hubtel_enabled ? "default" : "outline"}
                size="sm"
                disabled={togglePaymentMethod.isPending}
                className={paymentMethodSettings.hubtel_enabled ? "bg-green-600 hover:bg-green-700" : ""}
              >
                {paymentMethodSettings.hubtel_enabled ? (
                  <>
                    <Power className="w-4 h-4 mr-2" />
                    Enabled
                  </>
                ) : (
                  <>
                    <PowerOff className="w-4 h-4 mr-2" />
                    Disabled
                  </>
                )}
              </Button>
            </div>
          </div>
          
          {/* Korapay */}
          <div className="flex items-center justify-between p-4 bg-white/50 rounded-xl border-2 border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-teal-600 rounded-lg flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Korapay</p>
                <p className="text-sm text-gray-600">Korapay payment gateway</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Label htmlFor="korapay-min" className="text-sm text-gray-700 whitespace-nowrap">Min: ₵</Label>
                <Input
                  id="korapay-min"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={minDepositSettings.korapay_min}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '' || parseFloat(value) >= 0) {
                      setMinDepositSettings(prev => ({ ...prev, korapay_min: value }));
                    }
                  }}
                  onBlur={(e) => {
                    const value = parseFloat(e.target.value);
                    if (!isNaN(value) && value > 0) {
                      handleUpdateMinDeposit('korapay', value);
                    }
                  }}
                  className="w-20 h-9 text-sm"
                />
              </div>
              <Button
                onClick={() => handleTogglePaymentMethod('korapay', !paymentMethodSettings.korapay_enabled)}
                variant={paymentMethodSettings.korapay_enabled ? "default" : "outline"}
                size="sm"
                disabled={togglePaymentMethod.isPending}
                className={paymentMethodSettings.korapay_enabled ? "bg-green-600 hover:bg-green-700" : ""}
              >
                {paymentMethodSettings.korapay_enabled ? (
                  <>
                    <Power className="w-4 h-4 mr-2" />
                    Enabled
                  </>
                ) : (
                  <>
                    <PowerOff className="w-4 h-4 mr-2" />
                    Disabled
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

AdminSettings.displayName = 'AdminSettings';

export default AdminSettings;

