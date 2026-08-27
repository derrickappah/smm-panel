import { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { queryClient as defaultQueryClient } from '@/lib/queryClient';

export const PAYMENT_SETTINGS_QUERY_KEY = ['payment-settings'];

// Centralized default values to avoid hardcoding in multiple places
export const DEFAULT_PAYMENT_SETTINGS = {
  paymentMethodSettings: {
    paystack_enabled: false,
    manual_enabled: false,
    hubtel_enabled: false,
    korapay_enabled: false,
    moolre_enabled: false,
    moolre_web_enabled: true // Enable by default for immediate UI
  },
  minDepositSettings: {
    paystack_min: 10,
    manual_min: 10,
    hubtel_min: 1,
    korapay_min: 1,
    moolre_min: 1,
    moolre_web_min: 1
  },
  manualDepositDetails: {
    phone_number: '',
    account_name: '',
    instructions: ''
  },
  whatsappNumber: '0500861771',
  supportPhoneNumber: '0500861771',
  requireCaptcha: false, // Default to false (Admins can toggle on/off)
  requireOtp: false, // Default to false (Admins can toggle on/off)
  requirePhoneVerification: false, // Default to false (Admins can toggle on/off via Moolre SMS)
  moolreSenderId: 'Boostupgh',
  depositMethod: 'moolre_web' // Default method
};

export const isPaymentMethodEnabled = (method, paymentMethodSettings) => {
  if (!method || !paymentMethodSettings) return false;
  if (method === 'paystack') return !!paymentMethodSettings.paystack_enabled;
  if (method === 'manual') return !!paymentMethodSettings.manual_enabled;
  if (method === 'hubtel') return !!paymentMethodSettings.hubtel_enabled;
  if (method === 'korapay') return !!paymentMethodSettings.korapay_enabled;
  if (method === 'moolre') return !!paymentMethodSettings.moolre_enabled;
  if (method === 'moolre_web') return !!paymentMethodSettings.moolre_web_enabled;
  return false;
};

export const getFirstEnabledPaymentMethod = (paymentMethodSettings) => {
  if (!paymentMethodSettings) return null;
  if (paymentMethodSettings.moolre_web_enabled) return 'moolre_web';
  if (paymentMethodSettings.moolre_enabled) return 'moolre';
  if (paymentMethodSettings.paystack_enabled) return 'paystack';
  if (paymentMethodSettings.manual_enabled) return 'manual';
  if (paymentMethodSettings.hubtel_enabled) return 'hubtel';
  if (paymentMethodSettings.korapay_enabled) return 'korapay';
  return null;
};

// Fetcher function that can be used by useQuery
export const fetchPaymentSettingsFn = async () => {
  const { data, error } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', [
      'payment_method_paystack_enabled',
      'payment_method_manual_enabled',
      'payment_method_hubtel_enabled',
      'payment_method_korapay_enabled',
      'payment_method_moolre_enabled',
      'payment_method_moolre_web_enabled',
      'payment_method_paystack_min_deposit',
      'payment_method_manual_min_deposit',
      'payment_method_hubtel_min_deposit',
      'payment_method_korapay_min_deposit',
      'payment_method_moolre_min_deposit',
      'payment_method_moolre_web_min_deposit',
      'manual_deposit_phone_number',
      'manual_deposit_account_name',
      'manual_deposit_instructions',
      'whatsapp_number',
      'require_captcha',
      'require_otp',
      'require_phone_verification',
      'moolre_sender_id',
      'support_phone_number'
    ]);

  if (error) {
    console.error('Error fetching payment settings:', error);
    throw error;
  }

  // Start with defaults
  const settings = { ...DEFAULT_PAYMENT_SETTINGS };
  const rawSettings = {};

  // Map array to object for easier lookup
  data?.forEach(item => {
    rawSettings[item.key] = item.value;
  });

  // Helper to get boolean with default
  const getEnabled = (key, defaultVal) => {
    if (rawSettings[key] === undefined) return defaultVal;
    return rawSettings[key] === 'true';
  };

  // Helper to get float with default
  const getMin = (key, defaultVal) => {
    if (rawSettings[key] === undefined) return defaultVal;
    return parseFloat(rawSettings[key]) || defaultVal;
  };

  // Helper to get string with default
  const getString = (key, defaultVal) => {
    return rawSettings[key] || defaultVal;
  };

  // Parse Enabled Status
  settings.paymentMethodSettings = {
    paystack_enabled: getEnabled('payment_method_paystack_enabled', DEFAULT_PAYMENT_SETTINGS.paymentMethodSettings.paystack_enabled),
    manual_enabled: getEnabled('payment_method_manual_enabled', DEFAULT_PAYMENT_SETTINGS.paymentMethodSettings.manual_enabled),
    hubtel_enabled: getEnabled('payment_method_hubtel_enabled', DEFAULT_PAYMENT_SETTINGS.paymentMethodSettings.hubtel_enabled),
    korapay_enabled: getEnabled('payment_method_korapay_enabled', DEFAULT_PAYMENT_SETTINGS.paymentMethodSettings.korapay_enabled),
    moolre_enabled: getEnabled('payment_method_moolre_enabled', DEFAULT_PAYMENT_SETTINGS.paymentMethodSettings.moolre_enabled),
    moolre_web_enabled: getEnabled('payment_method_moolre_web_enabled', DEFAULT_PAYMENT_SETTINGS.paymentMethodSettings.moolre_web_enabled)
  };

  // Parse Min Deposits
  settings.minDepositSettings = {
    paystack_min: getMin('payment_method_paystack_min_deposit', DEFAULT_PAYMENT_SETTINGS.minDepositSettings.paystack_min),
    manual_min: getMin('payment_method_manual_min_deposit', DEFAULT_PAYMENT_SETTINGS.minDepositSettings.manual_min),
    hubtel_min: getMin('payment_method_hubtel_min_deposit', DEFAULT_PAYMENT_SETTINGS.minDepositSettings.hubtel_min),
    korapay_min: getMin('payment_method_korapay_min_deposit', DEFAULT_PAYMENT_SETTINGS.minDepositSettings.korapay_min),
    moolre_min: getMin('payment_method_moolre_min_deposit', DEFAULT_PAYMENT_SETTINGS.minDepositSettings.moolre_min),
    moolre_web_min: getMin('payment_method_moolre_web_min_deposit', DEFAULT_PAYMENT_SETTINGS.minDepositSettings.moolre_web_min)
  };

  // Parse Manual Details
  settings.manualDepositDetails = {
    phone_number: getString('manual_deposit_phone_number', DEFAULT_PAYMENT_SETTINGS.manualDepositDetails.phone_number),
    account_name: getString('manual_deposit_account_name', DEFAULT_PAYMENT_SETTINGS.manualDepositDetails.account_name),
    instructions: getString('manual_deposit_instructions', DEFAULT_PAYMENT_SETTINGS.manualDepositDetails.instructions)
  };

  // Parse WhatsApp
  settings.whatsappNumber = getString('whatsapp_number', DEFAULT_PAYMENT_SETTINGS.whatsappNumber);

  // Parse Support Phone Number
  settings.supportPhoneNumber = getString('support_phone_number', DEFAULT_PAYMENT_SETTINGS.supportPhoneNumber);

  // Parse CAPTCHA
  settings.requireCaptcha = getEnabled('require_captcha', DEFAULT_PAYMENT_SETTINGS.requireCaptcha);

  // Parse OTP Verification
  settings.requireOtp = getEnabled('require_otp', DEFAULT_PAYMENT_SETTINGS.requireOtp);

  // Parse Phone Verification (Moolre SMS)
  settings.requirePhoneVerification = getEnabled('require_phone_verification', DEFAULT_PAYMENT_SETTINGS.requirePhoneVerification);
  settings.moolreSenderId = getString('moolre_sender_id', DEFAULT_PAYMENT_SETTINGS.moolreSenderId);

  // Determine Deposit Method
  settings.depositMethod = getFirstEnabledPaymentMethod(settings.paymentMethodSettings);

  return settings;
};

// Prefetch function to populate cache
export const prefetchPaymentSettings = async () => {
  try {
    return await defaultQueryClient.prefetchQuery({
      queryKey: PAYMENT_SETTINGS_QUERY_KEY,
      queryFn: fetchPaymentSettingsFn
    });
  } catch (err) {
    console.warn('Error prefetching payment settings:', err);
  }
};

export const usePaymentMethods = () => {
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: PAYMENT_SETTINGS_QUERY_KEY,
    queryFn: fetchPaymentSettingsFn,
    staleTime: 0, // always consider data stale
    refetchInterval: 10000, // Poll every 10s to guarantee sync
    refetchOnWindowFocus: true, // refetch when window gains focus
    placeholderData: DEFAULT_PAYMENT_SETTINGS // Use defaults while loading
  });

  // Real-time synchronization for app_settings changes
  useEffect(() => {
    // 1. Supabase realtime postgres_changes subscription
    const channel = supabase
      .channel('payment-settings-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'app_settings'
        },
        () => {
          queryClient.invalidateQueries({ queryKey: PAYMENT_SETTINGS_QUERY_KEY });
        }
      )
      .on(
        'broadcast',
        { event: 'payment_settings_changed' },
        () => {
          queryClient.invalidateQueries({ queryKey: PAYMENT_SETTINGS_QUERY_KEY });
        }
      )
      .subscribe();

    // 2. BroadcastChannel for cross-tab sync in the browser
    let bc;
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        bc = new BroadcastChannel('payment_settings_sync');
        bc.onmessage = () => {
          queryClient.invalidateQueries({ queryKey: PAYMENT_SETTINGS_QUERY_KEY });
        };
      }
    } catch {
      // Ignore BroadcastChannel errors
    }

    return () => {
      supabase.removeChannel(channel);
      if (bc) {
        bc.close();
      }
    };
  }, [queryClient]);

  // Load from localStorage or use data default
  const getInitialMethod = () => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('last_deposit_method') : null;
    return saved || data?.depositMethod || DEFAULT_PAYMENT_SETTINGS.depositMethod;
  };

  // Manage selected deposit method state locally to allow UI switching
  const [internalDepositMethod, setInternalDepositMethod] = useState(getInitialMethod);

  const currentSettings = data?.paymentMethodSettings || DEFAULT_PAYMENT_SETTINGS.paymentMethodSettings;

  // Compute effective deposit method synchronously so that if the current selection
  // is turned off by admins, it immediately resolves to an enabled method (or null)
  const effectiveDepositMethod = useMemo(() => {
    // If internal state is an enabled method, keep using it
    if (internalDepositMethod && isPaymentMethodEnabled(internalDepositMethod, currentSettings)) {
      return internalDepositMethod;
    }
    // Otherwise fallback to first enabled method from settings
    return getFirstEnabledPaymentMethod(currentSettings);
  }, [internalDepositMethod, currentSettings]);

  // Synchronize internal state and localStorage whenever effective method changes
  useEffect(() => {
    if (internalDepositMethod !== effectiveDepositMethod) {
      setInternalDepositMethod(effectiveDepositMethod);
    }
    if (typeof window !== 'undefined') {
      if (effectiveDepositMethod) {
        localStorage.setItem('last_deposit_method', effectiveDepositMethod);
      } else {
        localStorage.removeItem('last_deposit_method');
      }
    }
  }, [effectiveDepositMethod, internalDepositMethod]);

  // Wrapper for setDepositMethod to persist in localStorage
  const setDepositMethod = (method) => {
    if (isPaymentMethodEnabled(method, currentSettings)) {
      setInternalDepositMethod(method);
      if (typeof window !== 'undefined') {
        localStorage.setItem('last_deposit_method', method);
      }
    }
  };

  return {
    depositMethod: effectiveDepositMethod,
    setDepositMethod,
    paymentMethodSettings: currentSettings,
    minDepositSettings: data?.minDepositSettings || DEFAULT_PAYMENT_SETTINGS.minDepositSettings,
    manualDepositDetails: data?.manualDepositDetails || DEFAULT_PAYMENT_SETTINGS.manualDepositDetails,
    whatsappNumber: data?.whatsappNumber || DEFAULT_PAYMENT_SETTINGS.whatsappNumber,
    supportPhoneNumber: data?.supportPhoneNumber || DEFAULT_PAYMENT_SETTINGS.supportPhoneNumber,
    requireCaptcha: data?.requireCaptcha ?? DEFAULT_PAYMENT_SETTINGS.requireCaptcha,
    requireOtp: data?.requireOtp ?? DEFAULT_PAYMENT_SETTINGS.requireOtp,
    requirePhoneVerification: data?.requirePhoneVerification ?? DEFAULT_PAYMENT_SETTINGS.requirePhoneVerification,
    moolreSenderId: data?.moolreSenderId || DEFAULT_PAYMENT_SETTINGS.moolreSenderId,
    isLoading,
    refetch: () => {
      queryClient.invalidateQueries({ queryKey: PAYMENT_SETTINGS_QUERY_KEY });
      refetch();
    }
  };
};
