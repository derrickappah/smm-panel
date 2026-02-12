import React, { memo, useState, useEffect, useCallback } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { RefreshCw, Save, CreditCard, Banknote, Smartphone, Globe, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { logUserActivity } from '@/lib/activityLogger';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';

const AdminSettings = memo(() => {
  const queryClient = useQueryClient();
  const {
    paymentMethodSettings: remotePaymentSettings,
    minDepositSettings: remoteMinDepositSettings,
    manualDepositDetails: remoteManualDepositDetails,
    whatsappNumber: remoteWhatsappNumber,
    isLoading,
    refetch
  } = usePaymentMethods();

  const [paymentMethodSettings, setPaymentMethodSettings] = useState(remotePaymentSettings);
  const [minDepositSettings, setMinDepositSettings] = useState(remoteMinDepositSettings);
  const [manualDepositDetails, setManualDepositDetails] = useState(remoteManualDepositDetails);
  const [whatsappNumber, setWhatsappNumber] = useState(remoteWhatsappNumber);

  useEffect(() => {
    if (!isLoading) {
      setPaymentMethodSettings(remotePaymentSettings);
      setMinDepositSettings(remoteMinDepositSettings);
      setManualDepositDetails(remoteManualDepositDetails);
      setWhatsappNumber(remoteWhatsappNumber);
    }
  }, [remotePaymentSettings, remoteMinDepositSettings, remoteManualDepositDetails, remoteWhatsappNumber, isLoading]);

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
      } else if (method === 'moolre') {
        settingKey = 'payment_method_moolre_enabled';
        description = 'Enable/disable Moolre payment method';
        stateKey = 'moolre_enabled';
        displayName = 'Moolre';
      } else if (method === 'moolre_web') {
        settingKey = 'payment_method_moolre_web_enabled';
        description = 'Enable/disable Moolre Web payment method';
        stateKey = 'moolre_web_enabled';
        displayName = 'Moolre Web';
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
    onSuccess: async ({ stateKey, enabled, displayName }) => {
      setPaymentMethodSettings(prev => ({
        ...prev,
        [stateKey]: enabled
      }));
      queryClient.invalidateQueries({ queryKey: ['admin', 'payment-settings'] });
      queryClient.invalidateQueries({ queryKey: ['payment-settings'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });

      // Log settings change
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await logUserActivity({
            action_type: 'settings_changed',
            entity_type: 'settings',
            description: `${displayName} payment method ${enabled ? 'enabled' : 'disabled'}`,
            metadata: {
              setting_key: `payment_method_${displayName.toLowerCase().replace(' ', '_')}_enabled`,
              old_value: !enabled,
              new_value: enabled
            },
            severity: 'security'
          });
        }
      } catch (error) {
        console.warn('Failed to log settings change:', error);
      }

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
      } else if (method === 'moolre') {
        settingKey = 'payment_method_moolre_min_deposit';
        description = 'Minimum deposit amount for Moolre payment method';
        stateKey = 'moolre_min';
        displayName = 'Moolre';
      } else if (method === 'moolre_web') {
        settingKey = 'payment_method_moolre_web_min_deposit';
        description = 'Minimum deposit amount for Moolre Web payment method';
        stateKey = 'moolre_web_min';
        displayName = 'Moolre Web';
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
    onSuccess: async ({ stateKey, amount, displayName }) => {
      setMinDepositSettings(prev => ({
        ...prev,
        [stateKey]: amount
      }));
      queryClient.invalidateQueries({ queryKey: ['admin', 'payment-settings'] });
      queryClient.invalidateQueries({ queryKey: ['payment-settings'] });

      // Log settings change
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await logUserActivity({
            action_type: 'settings_changed',
            entity_type: 'settings',
            description: `${displayName} minimum deposit updated to ₵${amount}`,
            metadata: {
              setting_key: `payment_method_${displayName.toLowerCase().replace(' ', '_')}_min_deposit`,
              new_value: amount
            },
            severity: 'info'
          });
        }
      } catch (error) {
        console.warn('Failed to log settings change:', error);
      }

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

  const updateManualDepositDetails = useMutation({
    mutationFn: async ({ phoneNumber, accountName, instructions }) => {
      if (!phoneNumber || !phoneNumber.trim()) {
        throw new Error('Phone number is required');
      }
      if (!accountName || !accountName.trim()) {
        throw new Error('Account name is required');
      }
      if (!instructions || !instructions.trim()) {
        throw new Error('Instructions are required');
      }

      const updates = [
        {
          key: 'manual_deposit_phone_number',
          value: phoneNumber.trim(),
          description: 'Phone number for manual deposit payments'
        },
        {
          key: 'manual_deposit_account_name',
          value: accountName.trim(),
          description: 'Account holder name for manual deposits'
        },
        {
          key: 'manual_deposit_instructions',
          value: instructions.trim(),
          description: 'Instructions text for manual deposit process'
        }
      ];

      const { error } = await supabase
        .from('app_settings')
        .upsert(updates, {
          onConflict: 'key'
        });

      if (error) throw error;
      return { phoneNumber: phoneNumber.trim(), accountName: accountName.trim(), instructions: instructions.trim() };
    },
    onSuccess: ({ phoneNumber, accountName, instructions }) => {
      setManualDepositDetails({
        phone_number: phoneNumber,
        account_name: accountName,
        instructions: instructions
      });
      queryClient.invalidateQueries({ queryKey: ['admin', 'payment-settings'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'manual-deposit-details'] });
      queryClient.invalidateQueries({ queryKey: ['payment-methods'] });
      queryClient.invalidateQueries({ queryKey: ['payment-settings'] });
      toast.success('Manual deposit details updated successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update manual deposit details');
    },
  });

  const handleSaveManualDepositDetails = useCallback(() => {
    updateManualDepositDetails.mutate({
      phoneNumber: manualDepositDetails.phone_number,
      accountName: manualDepositDetails.account_name,
      instructions: manualDepositDetails.instructions
    });
  }, [updateManualDepositDetails, manualDepositDetails]);

  const updateWhatsappNumber = useMutation({
    mutationFn: async (number) => {
      if (!number || !number.trim()) {
        throw new Error('WhatsApp number is required');
      }

      const { error } = await supabase
        .from('app_settings')
        .upsert({
          key: 'whatsapp_number',
          value: number.trim(),
          description: 'WhatsApp number for support and deposits'
        }, {
          onConflict: 'key'
        });

      if (error) throw error;
      return number.trim();
    },
    onSuccess: (number) => {
      setWhatsappNumber(number);
      queryClient.invalidateQueries({ queryKey: ['admin', 'payment-settings'] });
      queryClient.invalidateQueries({ queryKey: ['payment-methods'] });
      queryClient.invalidateQueries({ queryKey: ['payment-settings'] });
      toast.success('WhatsApp number updated successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update WhatsApp number');
    },
  });

  const handleSaveWhatsappNumber = useCallback(() => {
    updateWhatsappNumber.mutate(whatsappNumber);
  }, [updateWhatsappNumber, whatsappNumber]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between mb-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-9 w-24" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-48 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const paymentMethods = [
    {
      id: 'paystack',
      name: 'Paystack',
      description: 'Online payment gateway',
      icon: CreditCard,
      color: 'bg-blue-100 text-blue-600',
      enabled: paymentMethodSettings.paystack_enabled,
      min: minDepositSettings.paystack_min
    },
    {
      id: 'manual',
      name: 'Manual (Mobile Money)',
      description: 'Direct mobile money transfer',
      icon: Smartphone,
      color: 'bg-yellow-100 text-yellow-600',
      enabled: paymentMethodSettings.manual_enabled,
      min: minDepositSettings.manual_min
    },
    {
      id: 'hubtel',
      name: 'Hubtel',
      description: 'Hubtel payment gateway',
      icon: CreditCard,
      color: 'bg-red-100 text-red-600',
      enabled: paymentMethodSettings.hubtel_enabled,
      min: minDepositSettings.hubtel_min
    },
    {
      id: 'korapay',
      name: 'Korapay',
      description: 'Korapay payment gateway',
      icon: Globe,
      color: 'bg-green-100 text-green-600',
      enabled: paymentMethodSettings.korapay_enabled,
      min: minDepositSettings.korapay_min
    },
    {
      id: 'moolre',
      name: 'Moolre',
      description: 'Moolre Direct Mobile Money',
      icon: Banknote,
      color: 'bg-purple-100 text-purple-600',
      enabled: paymentMethodSettings.moolre_enabled,
      min: minDepositSettings.moolre_min
    },
    {
      id: 'moolre_web',
      name: 'Moolre Web',
      description: 'Moolre Web Portal payment',
      icon: Globe,
      color: 'bg-indigo-100 text-indigo-600',
      enabled: paymentMethodSettings.moolre_web_enabled,
      min: minDepositSettings.moolre_web_min
    }
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">Payment Methods</h2>
          <p className="text-muted-foreground mt-1">Configure available payment options and deposit limits.</p>
        </div>
        <Button
          onClick={() => refetch()}
          disabled={isLoading}
          variant="outline"
          size="sm"
          className="gap-2 transition-all hover:bg-gray-100"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh Status
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {paymentMethods.map((method) => (
          <Card key={method.id} className={`group transition-all duration-300 hover:shadow-lg border-2 ${method.enabled ? 'border-primary/10' : 'border-gray-100 bg-gray-50/50'}`}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className={`p-2 rounded-lg ${method.color} transition-colors group-hover:scale-110 duration-300`}>
                <method.icon className="w-5 h-5" />
              </div>
              <Switch
                checked={method.enabled}
                onCheckedChange={(checked) => handleTogglePaymentMethod(method.id, checked)}
                disabled={togglePaymentMethod.isPending}
                aria-label={`Toggle ${method.name}`}
              />
            </CardHeader>
            <CardContent>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <CardTitle className="text-lg font-semibold">{method.name}</CardTitle>
                  <CardDescription className="text-xs mt-1">
                    {method.description}
                  </CardDescription>
                </div>
                <Badge variant={method.enabled ? "default" : "secondary"} className={method.enabled ? "bg-green-500 hover:bg-green-600" : "bg-gray-200 text-gray-500"}>
                  {method.enabled ? 'Active' : 'Inactive'}
                </Badge>
              </div>

              <div className="space-y-2 pt-2 border-t">
                <div className="flex items-center justify-between">
                  <Label htmlFor={`${method.id}-min`} className="text-sm font-medium text-gray-600">
                    Min Deposit (₵)
                  </Label>
                  <Input
                    id={`${method.id}-min`}
                    type="number"
                    step="0.01"
                    min="0.01"
                    defaultValue={method.min}
                    onBlur={(e) => {
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val) && val > 0 && val !== method.min) {
                        handleUpdateMinDeposit(method.id, val);
                      }
                    }}
                    className="w-24 h-8 text-right font-mono text-sm"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Separator className="my-8" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <Card className="border-2 border-primary/5 shadow-md">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-100 text-yellow-700 rounded-lg">
                  <SettingsIcon className="w-5 h-5" />
                </div>
                <div>
                  <CardTitle>Manual Deposit Settings</CardTitle>
                  <CardDescription>Configure the details shown to users for manual transfers.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="manual-phone">Momo Number</Label>
                  <Input
                    id="manual-phone"
                    value={manualDepositDetails.phone_number}
                    onChange={(e) => setManualDepositDetails(prev => ({ ...prev, phone_number: e.target.value }))}
                    placeholder="0559272762"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="manual-account">Account Name</Label>
                  <Input
                    id="manual-account"
                    value={manualDepositDetails.account_name}
                    onChange={(e) => setManualDepositDetails(prev => ({ ...prev, account_name: e.target.value }))}
                    placeholder="MTN - NAME"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="manual-instructions">Instructions</Label>
                <Textarea
                  id="manual-instructions"
                  value={manualDepositDetails.instructions}
                  onChange={(e) => setManualDepositDetails(prev => ({ ...prev, instructions: e.target.value }))}
                  placeholder="Enter step-by-step instructions..."
                  className="min-h-[120px] resize-y font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Use newlines to separate steps.
                </p>
              </div>
            </CardContent>
            <CardFooter className="bg-gray-50/50 justify-end rounded-b-xl border-t p-4">
              <Button
                onClick={handleSaveManualDepositDetails}
                disabled={updateManualDepositDetails.isPending}
                className="bg-primary hover:bg-primary/90 transition-all shadow-sm"
              >
                <Save className="w-4 h-4 mr-2" />
                {updateManualDepositDetails.isPending ? 'Saving...' : 'Save Configuration'}
              </Button>
            </CardFooter>
          </Card>
        </div>

        <div className="lg:col-span-1">
          <Card className="border-2 border-green-100 shadow-md h-full">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 text-green-700 rounded-lg">
                  <MessageCircle className="w-5 h-5" />
                </div>
                <div>
                  <CardTitle>Support Contact</CardTitle>
                  <CardDescription>WhatsApp number for user support.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="whatsapp-number">WhatsApp Number</Label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-gray-400 text-sm">Now</span>
                  <Input
                    id="whatsapp-number"
                    value={whatsappNumber}
                    onChange={(e) => setWhatsappNumber(e.target.value)}
                    placeholder="233xxxxxxxxx"
                    className="pl-12"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Format: 233... (No +)
                </p>
              </div>
            </CardContent>
            <CardFooter className="bg-green-50/50 justify-end rounded-b-xl border-t p-4 mt-auto">
              <Button
                onClick={handleSaveWhatsappNumber}
                disabled={updateWhatsappNumber.isPending}
                variant="outline"
                className="w-full hover:bg-green-50 hover:text-green-700 border-green-200"
              >
                <Save className="w-4 h-4 mr-2" />
                Update Number
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
});

// Helper icon component
const SettingsIcon = (props) => (
  <svg
    {...props}
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

AdminSettings.displayName = 'AdminSettings';

export default AdminSettings;
