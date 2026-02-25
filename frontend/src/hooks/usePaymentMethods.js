import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

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
  whatsappNumber: '',
  depositMethod: 'moolre_web' // Default method
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
      'whatsapp_number'
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

  // Determine Deposit Method
  let depositMethod = null;
  const pm = settings.paymentMethodSettings;

  if (pm.moolre_web_enabled) depositMethod = 'moolre_web';
  else if (pm.moolre_enabled) depositMethod = 'moolre';
  else if (pm.paystack_enabled) depositMethod = 'paystack';
  else if (pm.manual_enabled) depositMethod = 'manual';
  else if (pm.hubtel_enabled) depositMethod = 'hubtel';
  else if (pm.korapay_enabled) depositMethod = 'korapay';

  return { ...settings, depositMethod };
};

// Legacy support for prefetch (now uses queryClient if available or direct fetch)
export const prefetchPaymentSettings = async () => {
  return fetchPaymentSettingsFn();
};

export const usePaymentMethods = () => {
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: PAYMENT_SETTINGS_QUERY_KEY,
    queryFn: fetchPaymentSettingsFn,
    staleTime: 0, // always consider data stale
    refetchOnWindowFocus: true, // refetch when window gains focus
    placeholderData: DEFAULT_PAYMENT_SETTINGS // Use defaults while loading
  });

  // Load from localStorage or use data default
  const getInitialMethod = () => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('last_deposit_method') : null;
    return saved || data?.depositMethod || DEFAULT_PAYMENT_SETTINGS.depositMethod;
  };

  // Manage selected deposit method state locally to allow UI switching
  const [depositMethod, setInternalDepositMethod] = useState(getInitialMethod);

  // Wrapper for setDepositMethod to persist in localStorage
  const setDepositMethod = (method) => {
    setInternalDepositMethod(method);
    if (typeof window !== 'undefined') {
      localStorage.setItem('last_deposit_method', method);
    }
  };

  // Update local state when data loads if not already set or if it's currently the default
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('last_deposit_method') : null;

    if (data?.depositMethod && !saved) {
      // If we don't have a saved preference, respect the server's recommendation
      setInternalDepositMethod(data.depositMethod);
    }
  }, [data?.depositMethod]);

  return {
    depositMethod: depositMethod || data?.depositMethod || DEFAULT_PAYMENT_SETTINGS.depositMethod,
    setDepositMethod,
    paymentMethodSettings: data?.paymentMethodSettings || DEFAULT_PAYMENT_SETTINGS.paymentMethodSettings,
    minDepositSettings: data?.minDepositSettings || DEFAULT_PAYMENT_SETTINGS.minDepositSettings,
    manualDepositDetails: data?.manualDepositDetails || DEFAULT_PAYMENT_SETTINGS.manualDepositDetails,
    whatsappNumber: data?.whatsappNumber || DEFAULT_PAYMENT_SETTINGS.whatsappNumber,
    isLoading,
    refetch: () => {
      queryClient.invalidateQueries({ queryKey: PAYMENT_SETTINGS_QUERY_KEY });
    }
  };
};

