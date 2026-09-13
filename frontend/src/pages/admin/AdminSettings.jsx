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
import { RefreshCw, Save, CreditCard, Banknote, Smartphone, Globe, MessageCircle, ShieldCheck, Send, CheckCircle2, Clock, XCircle, Plus, Key } from 'lucide-react';
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
    supportPhoneNumber: remoteSupportPhoneNumber,
    requireCaptcha: remoteRequireCaptcha,
    requireOtp: remoteRequireOtp,
    requirePhoneVerification: remoteRequirePhoneVerification,
    moolreSenderId: remoteMoolreSenderId,
    isLoading,
    refetch
  } = usePaymentMethods();

  const [paymentMethodSettings, setPaymentMethodSettings] = useState(remotePaymentSettings);
  const [minDepositSettings, setMinDepositSettings] = useState(remoteMinDepositSettings);
  const [manualDepositDetails, setManualDepositDetails] = useState(remoteManualDepositDetails);
  const [whatsappNumber, setWhatsappNumber] = useState(remoteWhatsappNumber);
  const [supportPhoneNumber, setSupportPhoneNumber] = useState(remoteSupportPhoneNumber);
  const [requireCaptcha, setRequireCaptcha] = useState(remoteRequireCaptcha);
  const [requireOtp, setRequireOtp] = useState(remoteRequireOtp);
  const [requirePhoneVerification, setRequirePhoneVerification] = useState(remoteRequirePhoneVerification);
  const [moolreVasKey, setMoolreVasKey] = useState('');
  const [moolreSenderId, setMoolreSenderId] = useState(remoteMoolreSenderId || 'Boostupgh');

  // Hubtel & Provider Routing State
  const [hubtelClientId, setHubtelClientId] = useState('');
  const [hubtelClientSecret, setHubtelClientSecret] = useState('');
  const [hubtelSenderId, setHubtelSenderId] = useState('Boostupgh');
  const [primarySmsProvider, setPrimarySmsProvider] = useState('moolre');
  const [fallbackSmsProvider, setFallbackSmsProvider] = useState('hubtel');
  const [testingHubtelSms, setTestingHubtelSms] = useState(false);
  const [testPhoneRecipient, setTestPhoneRecipient] = useState('');

  const [smsBalance, setSmsBalance] = useState(null);
  const [loadingSmsBalance, setLoadingSmsBalance] = useState(false);
  const [senderIdsList, setSenderIdsList] = useState([]);
  const [loadingSenderIds, setLoadingSenderIds] = useState(false);
  const [newSenderIdInput, setNewSenderIdInput] = useState('');
  const [creatingSenderId, setCreatingSenderId] = useState(false);
  const [savingMoolreConfig, setSavingMoolreConfig] = useState(false);

  const fetchMoolreSettingsAndData = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const token = session.access_token;

      const res = await fetch('/api/admin/moolre-sms?action=get_settings', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && data.settings) {
        setRequirePhoneVerification(data.settings.require_phone_verification);
        setMoolreSenderId(data.settings.moolre_sender_id || 'Boostupgh');
        setMoolreVasKey(data.settings.moolre_vaskey || '');
      }

      // Fetch Hubtel settings
      const hubtelRes = await fetch('/api/admin/hubtel-sms?action=get_settings', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const hubtelData = await hubtelRes.json();
      if (hubtelData.success && hubtelData.settings) {
        setHubtelClientId(hubtelData.settings.hubtel_client_id || '');
        setHubtelClientSecret(hubtelData.settings.hubtel_client_secret || '');
        setHubtelSenderId(hubtelData.settings.hubtel_sender_id || 'Boostupgh');
        setPrimarySmsProvider(hubtelData.settings.primary_sms_provider || 'moolre');
        setFallbackSmsProvider(hubtelData.settings.fallback_sms_provider || 'hubtel');
      }
    } catch (err) {
      console.warn('Failed to load SMS settings:', err);
    }
  }, []);

  useEffect(() => {
    if (!isLoading) {
      setPaymentMethodSettings(remotePaymentSettings);
      setMinDepositSettings(remoteMinDepositSettings);
      setManualDepositDetails(remoteManualDepositDetails);
      setWhatsappNumber(remoteWhatsappNumber);
      setSupportPhoneNumber(remoteSupportPhoneNumber);
      setRequireCaptcha(remoteRequireCaptcha);
      setRequireOtp(remoteRequireOtp);
      setRequirePhoneVerification(remoteRequirePhoneVerification);
      setMoolreSenderId(remoteMoolreSenderId || 'Boostupgh');
    }
    fetchMoolreSettingsAndData();
  }, [remotePaymentSettings, remoteMinDepositSettings, remoteManualDepositDetails, remoteWhatsappNumber, remoteSupportPhoneNumber, remoteRequireCaptcha, remoteRequireOtp, remoteRequirePhoneVerification, remoteMoolreSenderId, isLoading, fetchMoolreSettingsAndData]);

  const handleSaveMoolreSettings = async () => {
    setSavingMoolreConfig(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');
      const token = session.access_token;

      const moolreRes = await fetch('/api/admin/moolre-sms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'save_settings',
          require_phone_verification: requirePhoneVerification,
          moolre_sender_id: moolreSenderId,
          moolre_vaskey: moolreVasKey
        })
      });

      const hubtelRes = await fetch('/api/admin/hubtel-sms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'save_settings',
          hubtel_client_id: hubtelClientId,
          hubtel_client_secret: hubtelClientSecret,
          hubtel_sender_id: hubtelSenderId,
          primary_sms_provider: primarySmsProvider,
          fallback_sms_provider: fallbackSmsProvider,
          require_phone_verification: requirePhoneVerification
        })
      });

      const mData = await moolreRes.json();
      const hData = await hubtelRes.json();

      if (mData.success && hData.success) {
        toast.success('SMS Gateways & Failover Routing settings saved successfully!');
        queryClient.invalidateQueries({ queryKey: ['payment-settings'] });
      } else {
        toast.error('Failed to save some SMS settings.');
      }
    } catch (err) {
      toast.error(err.message || 'Error saving SMS configuration');
    } finally {
      setSavingMoolreConfig(false);
    }
  };

  const handleSendTestSmsHubtel = async () => {
    if (!testPhoneRecipient.trim()) {
      toast.error('Please enter a test recipient phone number');
      return;
    }
    setTestingHubtelSms(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const res = await fetch('/api/admin/hubtel-sms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          action: 'send_test_sms',
          recipient: testPhoneRecipient,
          message: 'BoostUp GH Hubtel Test SMS Verification Code: 123456'
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`Hubtel Test SMS sent to ${testPhoneRecipient}!`);
      } else {
        toast.error(data.error || 'Hubtel Test SMS failed.');
      }
    } catch (err) {
      toast.error(err.message || 'Error sending Hubtel test SMS');
    } finally {
      setTestingHubtelSms(false);
    }
  };

  const handleFetchSmsBalance = async () => {
    setLoadingSmsBalance(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const res = await fetch('/api/admin/moolre-sms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          action: 'get_balance',
          vaskey: moolreVasKey
        })
      });

      const data = await res.json();
      if (data.status === 1 && data.data?.balance !== undefined) {
        setSmsBalance(data.data.balance);
        toast.success(`SMS Balance: ${data.data.balance} credits`);
      } else {
        toast.error(data.message || data.error || 'Failed to fetch SMS balance');
      }
    } catch (err) {
      toast.error(err.message || 'Failed to check SMS balance');
    } finally {
      setLoadingSmsBalance(false);
    }
  };

  const handleFetchSenderIds = async () => {
    setLoadingSenderIds(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const res = await fetch('/api/admin/moolre-sms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          action: 'list_sender_ids',
          vaskey: moolreVasKey
        })
      });

      const data = await res.json();
      if (data.status === 1 && Array.isArray(data.data)) {
        setSenderIdsList(data.data);
        toast.success(`Loaded ${data.data.length} Sender IDs`);
      } else {
        toast.error(data.message || data.error || 'Failed to list Sender IDs');
      }
    } catch (err) {
      toast.error(err.message || 'Failed to list Sender IDs');
    } finally {
      setLoadingSenderIds(false);
    }
  };

  const handleCreateSenderId = async () => {
    if (!newSenderIdInput.trim() || newSenderIdInput.trim().length > 11) {
      toast.error('Sender ID is required and must be max 11 characters');
      return;
    }
    setCreatingSenderId(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const res = await fetch('/api/admin/moolre-sms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          action: 'create_sender_id',
          senderid: newSenderIdInput.trim(),
          vaskey: moolreVasKey
        })
      });

      const data = await res.json();
      if (data.status === 1) {
        toast.success(data.message || 'Sender ID request submitted successfully!');
        setNewSenderIdInput('');
        handleFetchSenderIds();
      } else {
        toast.error(data.message || data.error || 'Failed to create Sender ID');
      }
    } catch (err) {
      toast.error(err.message || 'Failed to create Sender ID');
    } finally {
      setCreatingSenderId(false);
    }
  };

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
        description = 'Enable/disable Nigerian Payment method';
        stateKey = 'manual_enabled';
        displayName = 'Nigerian Payment';
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

      // Broadcast update across tabs and realtime clients
      try {
        if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
          const bc = new BroadcastChannel('payment_settings_sync');
          bc.postMessage({ type: 'payment_settings_changed', timestamp: Date.now() });
          bc.close();
        }
        supabase.channel('payment-settings-realtime').send({
          type: 'broadcast',
          event: 'payment_settings_changed',
          payload: { timestamp: Date.now() }
        });
      } catch (e) {
        // Broadcast best effort
      }

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
        description = 'Minimum deposit amount for Nigerian Payment method';
        stateKey = 'manual_min';
        displayName = 'Nigerian Payment';
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

  const updateSupportPhoneNumber = useMutation({
    mutationFn: async (number) => {
      if (!number || !number.trim()) {
        throw new Error('Support phone number is required');
      }

      const { error } = await supabase
        .from('app_settings')
        .upsert({
          key: 'support_phone_number',
          value: number.trim(),
          description: 'Phone number for support voice calls'
        }, {
          onConflict: 'key'
        });

      if (error) throw error;
      return number.trim();
    },
    onSuccess: (number) => {
      setSupportPhoneNumber(number);
      queryClient.invalidateQueries({ queryKey: ['admin', 'payment-settings'] });
      queryClient.invalidateQueries({ queryKey: ['payment-methods'] });
      queryClient.invalidateQueries({ queryKey: ['payment-settings'] });
      toast.success('Support phone number updated successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update support phone number');
    },
  });

  const handleSaveSupportPhoneNumber = useCallback(() => {
    updateSupportPhoneNumber.mutate(supportPhoneNumber);
  }, [updateSupportPhoneNumber, supportPhoneNumber]);

  const updateRequireCaptcha = useMutation({
    mutationFn: async (enabled) => {
      const { error } = await supabase
        .from('app_settings')
        .upsert({
          key: 'require_captcha',
          value: enabled ? 'true' : 'false',
          description: 'Require CAPTCHA verification for registration and login'
        }, {
          onConflict: 'key'
        });

      if (error) throw error;
      return enabled;
    },
    onSuccess: async (enabled) => {
      setRequireCaptcha(enabled);
      queryClient.invalidateQueries({ queryKey: ['admin', 'payment-settings'] });
      queryClient.invalidateQueries({ queryKey: ['payment-settings'] });

      // Log settings change
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await logUserActivity({
            action_type: 'settings_changed',
            entity_type: 'settings',
            description: `CAPTCHA verification ${enabled ? 'enabled' : 'disabled'}`,
            metadata: {
              setting_key: 'require_captcha',
              old_value: !enabled,
              new_value: enabled
            },
            severity: 'security'
          });
        }
      } catch (error) {
        console.warn('Failed to log settings change:', error);
      }

      toast.success(`CAPTCHA verification ${enabled ? 'enabled' : 'disabled'} successfully`);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update CAPTCHA setting');
    },
  });

  const handleToggleRequireCaptcha = useCallback((checked) => {
    updateRequireCaptcha.mutate(checked);
  }, [updateRequireCaptcha]);

  const updateRequireOtp = useMutation({
    mutationFn: async (enabled) => {
      const { error } = await supabase
        .from('app_settings')
        .upsert({
          key: 'require_otp',
          value: enabled ? 'true' : 'false',
          description: 'Require OTP verification for registration and sensitive activities'
        }, {
          onConflict: 'key'
        });

      if (error) throw error;
      return enabled;
    },
    onSuccess: async (enabled) => {
      setRequireOtp(enabled);
      queryClient.invalidateQueries({ queryKey: ['admin', 'payment-settings'] });
      queryClient.invalidateQueries({ queryKey: ['payment-settings'] });

      // Log settings change
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await logUserActivity({
            action_type: 'settings_changed',
            entity_type: 'settings',
            description: `OTP verification ${enabled ? 'enabled' : 'disabled'}`,
            metadata: {
              setting_key: 'require_otp',
              old_value: !enabled,
              new_value: enabled
            },
            severity: 'security'
          });
        }
      } catch (error) {
        console.warn('Failed to log settings change:', error);
      }

      toast.success(`OTP verification ${enabled ? 'enabled' : 'disabled'} successfully`);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update OTP setting');
    },
  });

  const handleToggleRequireOtp = useCallback((checked) => {
    updateRequireOtp.mutate(checked);
  }, [updateRequireOtp]);

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
      name: 'Nigerian Payment',
      description: 'Direct Nigerian bank or manual transfer',
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
      name: 'Korapay (Nigeria)',
      description: 'Korapay payment gateway (Nigeria / NGN)',
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

        <div className="lg:col-span-1 space-y-6">
          <Card className="border-2 border-green-100 shadow-md">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 text-green-700 rounded-lg">
                  <MessageCircle className="w-5 h-5" />
                </div>
                <div>
                  <CardTitle>Support Contacts</CardTitle>
                  <CardDescription>WhatsApp and phone support numbers.</CardDescription>
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

              <div className="space-y-2">
                <Label htmlFor="support-phone-number">Support Phone Number</Label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-gray-400 text-sm">Now</span>
                  <Input
                    id="support-phone-number"
                    value={supportPhoneNumber}
                    onChange={(e) => setSupportPhoneNumber(e.target.value)}
                    placeholder="233xxxxxxxxx"
                    className="pl-12"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Format: 233... (No +)
                </p>
              </div>
            </CardContent>
            <CardFooter className="bg-green-50/50 flex flex-col gap-2 rounded-b-xl border-t p-4">
              <Button
                onClick={handleSaveWhatsappNumber}
                disabled={updateWhatsappNumber.isPending}
                variant="outline"
                className="w-full hover:bg-green-50 hover:text-green-700 border-green-200"
              >
                <Save className="w-4 h-4 mr-2" />
                {updateWhatsappNumber.isPending ? 'Updating WhatsApp...' : 'Update WhatsApp Number'}
              </Button>
              <Button
                onClick={handleSaveSupportPhoneNumber}
                disabled={updateSupportPhoneNumber.isPending}
                variant="outline"
                className="w-full hover:bg-green-50 hover:text-green-700 border-green-200"
              >
                <Save className="w-4 h-4 mr-2" />
                {updateSupportPhoneNumber.isPending ? 'Updating Phone...' : 'Update Phone Number'}
              </Button>
            </CardFooter>
          </Card>

          <Card className="border-2 border-indigo-100 shadow-md">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-100 text-indigo-700 rounded-lg">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <CardTitle>Security Settings</CardTitle>
                  <CardDescription>Configure spam and bot protection settings.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-indigo-50/30 rounded-xl border border-indigo-50">
                <div className="space-y-0.5">
                  <Label htmlFor="captcha-protection" className="font-semibold text-gray-850">
                    CAPTCHA Protection
                  </Label>
                  <p className="text-xs text-muted-foreground max-w-[200px]">
                    Require Turnstile verification for login and sign up.
                  </p>
                </div>
                <Switch
                  id="captcha-protection"
                  checked={requireCaptcha}
                  onCheckedChange={handleToggleRequireCaptcha}
                  disabled={updateRequireCaptcha.isPending}
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-purple-50/30 rounded-xl border border-purple-50">
                <div className="space-y-0.5">
                  <Label htmlFor="phone-verification" className="font-semibold text-gray-850">
                    Phone Verification (Moolre SMS)
                  </Label>
                  <p className="text-xs text-muted-foreground max-w-[200px]">
                    Require phone verification via Moolre SMS during user signup.
                  </p>
                </div>
                <Switch
                  id="phone-verification"
                  checked={requirePhoneVerification}
                  onCheckedChange={(checked) => setRequirePhoneVerification(checked)}
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-blue-50/30 rounded-xl border border-blue-50">
                <div className="space-y-0.5">
                  <Label htmlFor="otp-verification" className="font-semibold text-gray-850">
                    OTP Verification
                  </Label>
                  <p className="text-xs text-muted-foreground max-w-[200px]">
                    Require OTP verification during user onboarding and sign-up.
                  </p>
                </div>
                <Switch
                  id="otp-verification"
                  checked={requireOtp}
                  onCheckedChange={handleToggleRequireOtp}
                  disabled={updateRequireOtp.isPending}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Separator className="my-8" />

      {/* Unified SMS Gateway & Failover Control Center */}
      <Card className="border-2 border-purple-100 shadow-md">
        <CardHeader className="bg-gradient-to-r from-purple-50/50 via-indigo-50/50 to-blue-50/50">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-gradient-to-tr from-purple-600 to-indigo-600 text-white rounded-xl shadow-sm">
                <Send className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-lg font-bold">Unified SMS Gateway & Failover Control Center</CardTitle>
                <CardDescription>Manage Moolre & Hubtel credentials, set Primary & Secondary SMS providers, and test live SMS delivery.</CardDescription>
              </div>
            </div>
            <Button
              onClick={handleSaveMoolreSettings}
              disabled={savingMoolreConfig}
              className="bg-purple-600 hover:bg-purple-700 text-white shadow-sm"
            >
              <Save className="w-4 h-4 mr-2" />
              {savingMoolreConfig ? 'Saving...' : 'Save All SMS Settings'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-8 pt-6">
          {/* Provider Failover Routing Section */}
          <div className="p-4 bg-gradient-to-r from-indigo-50/70 to-purple-50/70 rounded-2xl border border-indigo-100 space-y-4">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-indigo-600" />
              <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider">SMS Provider Failover Routing</h4>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="primary-provider" className="font-semibold text-xs text-gray-700">
                  Primary SMS Provider
                </Label>
                <select
                  id="primary-provider"
                  value={primarySmsProvider}
                  onChange={(e) => setPrimarySmsProvider(e.target.value)}
                  className="w-full h-10 px-3 text-sm bg-white border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="moolre">Moolre SMS Gateway (Primary)</option>
                  <option value="hubtel">Hubtel SMS Gateway (Primary)</option>
                </select>
                <p className="text-xs text-muted-foreground">
                  The initial provider used for all OTP verification codes and SMS dispatches.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="fallback-provider" className="font-semibold text-xs text-gray-700">
                  Secondary (Fallback) SMS Provider
                </Label>
                <select
                  id="fallback-provider"
                  value={fallbackSmsProvider}
                  onChange={(e) => setFallbackSmsProvider(e.target.value)}
                  className="w-full h-10 px-3 text-sm bg-white border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="hubtel">Hubtel SMS Gateway (Fallback)</option>
                  <option value="moolre">Moolre SMS Gateway (Fallback)</option>
                  <option value="none">None (No automatic failover)</option>
                </select>
                <p className="text-xs text-muted-foreground">
                  If the primary provider fails or times out (or if user requests resend), SMS routes automatically via fallback.
                </p>
              </div>
            </div>
          </div>

          {/* Moolre & Hubtel Configuration Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Moolre SMS Gateway Card */}
            <div className="p-5 bg-purple-50/30 rounded-2xl border border-purple-100 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge className="bg-purple-600 text-white">Moolre API</Badge>
                  <h4 className="text-sm font-bold text-gray-900">Moolre SMS Gateway</h4>
                </div>
                {primarySmsProvider === 'moolre' && (
                  <Badge variant="outline" className="border-purple-600 text-purple-700 text-[10px]">ACTIVE PRIMARY</Badge>
                )}
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="moolre-vaskey" className="text-xs font-semibold">Moolre API VAS Key</Label>
                  <Input
                    id="moolre-vaskey"
                    type="password"
                    value={moolreVasKey}
                    onChange={(e) => setMoolreVasKey(e.target.value)}
                    placeholder="X-API-VASKEY"
                    className="h-9 text-xs bg-white"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="moolre-senderid" className="text-xs font-semibold">Approved Moolre Sender ID</Label>
                  <Input
                    id="moolre-senderid"
                    maxLength={11}
                    value={moolreSenderId}
                    onChange={(e) => setMoolreSenderId(e.target.value)}
                    placeholder="e.g. Boostupgh"
                    className="h-9 text-xs bg-white"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between gap-3 border-t">
                <div className="text-xs font-semibold text-gray-700">
                  Balance: <span className="font-bold text-purple-700">{smsBalance !== null ? `${smsBalance} Credits` : '---'}</span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleFetchSmsBalance}
                  disabled={loadingSmsBalance}
                  className="h-8 text-xs border-purple-200 text-purple-700 hover:bg-purple-100"
                >
                  <RefreshCw className={`w-3 h-3 mr-1 ${loadingSmsBalance ? 'animate-spin' : ''}`} />
                  Check Balance
                </Button>
              </div>
            </div>

            {/* Hubtel SMS Gateway Card */}
            <div className="p-5 bg-blue-50/30 rounded-2xl border border-blue-100 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge className="bg-blue-600 text-white">Hubtel API</Badge>
                  <h4 className="text-sm font-bold text-gray-900">Hubtel SMS Gateway</h4>
                </div>
                {primarySmsProvider === 'hubtel' && (
                  <Badge variant="outline" className="border-blue-600 text-blue-700 text-[10px]">ACTIVE PRIMARY</Badge>
                )}
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="hubtel-clientid" className="text-xs font-semibold">Hubtel Client ID</Label>
                  <Input
                    id="hubtel-clientid"
                    value={hubtelClientId}
                    onChange={(e) => setHubtelClientId(e.target.value)}
                    placeholder="e.g. xtyygvzc"
                    className="h-9 text-xs bg-white font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="hubtel-secret" className="text-xs font-semibold">Hubtel Client Secret</Label>
                  <Input
                    id="hubtel-secret"
                    type="password"
                    value={hubtelClientSecret}
                    onChange={(e) => setHubtelClientSecret(e.target.value)}
                    placeholder="e.g. hujrpzzs"
                    className="h-9 text-xs bg-white font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="hubtel-senderid" className="text-xs font-semibold">Approved Hubtel Sender ID</Label>
                  <Input
                    id="hubtel-senderid"
                    maxLength={11}
                    value={hubtelSenderId}
                    onChange={(e) => setHubtelSenderId(e.target.value)}
                    placeholder="e.g. Boostupgh"
                    className="h-9 text-xs bg-white"
                  />
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Test SMS Dispatcher Section */}
          <div className="p-4 bg-gray-50 rounded-2xl border space-y-3">
            <div className="flex items-center gap-2">
              <Send className="w-4 h-4 text-blue-600" />
              <h4 className="text-sm font-bold text-gray-900">Live SMS Dispatch Tester</h4>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3">
              <Input
                placeholder="Recipient Phone Number (e.g. 0599342940)"
                value={testPhoneRecipient}
                onChange={(e) => setTestPhoneRecipient(e.target.value)}
                className="h-9 text-xs bg-white sm:max-w-xs"
              />
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSendTestSmsHubtel}
                  disabled={testingHubtelSms || !testPhoneRecipient.trim()}
                  className="h-9 text-xs bg-blue-600 hover:bg-blue-700 text-white flex-1 sm:flex-none"
                >
                  <Send className="w-3.5 h-3.5 mr-1" />
                  {testingHubtelSms ? 'Testing...' : 'Test Hubtel SMS'}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
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
