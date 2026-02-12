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
    moolre_web_enabled: false
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
  whatsappNumber: '0500865092'
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

  // Parse Enabled Status
  settings.paymentMethodSettings = {
    paystack_enabled: rawSettings.payment_method_paystack_enabled === 'true',
    manual_enabled: rawSettings.payment_method_manual_enabled === 'true',
    hubtel_enabled: rawSettings.payment_method_hubtel_enabled === 'true',
    korapay_enabled: rawSettings.payment_method_korapay_enabled === 'true',
    moolre_enabled: rawSettings.payment_method_moolre_enabled === 'true',
    moolre_web_enabled: rawSettings.payment_method_moolre_web_enabled === 'true'
  };

  // Parse Min Deposits
  settings.minDepositSettings = {
    paystack_min: parseFloat(rawSettings.payment_method_paystack_min_deposit) || DEFAULT_PAYMENT_SETTINGS.minDepositSettings.paystack_min,
    manual_min: parseFloat(rawSettings.payment_method_manual_min_deposit) || DEFAULT_PAYMENT_SETTINGS.minDepositSettings.manual_min,
    hubtel_min: parseFloat(rawSettings.payment_method_hubtel_min_deposit) || DEFAULT_PAYMENT_SETTINGS.minDepositSettings.hubtel_min,
    korapay_min: parseFloat(rawSettings.payment_method_korapay_min_deposit) || DEFAULT_PAYMENT_SETTINGS.minDepositSettings.korapay_min,
    moolre_min: parseFloat(rawSettings.payment_method_moolre_min_deposit) || DEFAULT_PAYMENT_SETTINGS.minDepositSettings.moolre_min,
    moolre_web_min: parseFloat(rawSettings.payment_method_moolre_web_min_deposit) || DEFAULT_PAYMENT_SETTINGS.minDepositSettings.moolre_web_min
  };

  // Parse Manual Details
  settings.manualDepositDetails = {
    phone_number: rawSettings.manual_deposit_phone_number || DEFAULT_PAYMENT_SETTINGS.manualDepositDetails.phone_number,
    account_name: rawSettings.manual_deposit_account_name || DEFAULT_PAYMENT_SETTINGS.manualDepositDetails.account_name,
    instructions: rawSettings.manual_deposit_instructions || DEFAULT_PAYMENT_SETTINGS.manualDepositDetails.instructions
  };

  // Parse WhatsApp
  settings.whatsappNumber = rawSettings.whatsapp_number || DEFAULT_PAYMENT_SETTINGS.whatsappNumber;

  // Determine Deposit Method
  let depositMethod = null;
  const pm = settings.paymentMethodSettings;

  if (!pm.paystack_enabled && pm.manual_enabled && !pm.hubtel_enabled && !pm.korapay_enabled && !pm.moolre_enabled && !pm.moolre_web_enabled) {
    depositMethod = 'manual';
  } else if (pm.paystack_enabled && !pm.manual_enabled && !pm.hubtel_enabled && !pm.korapay_enabled && !pm.moolre_enabled && !pm.moolre_web_enabled) {
    depositMethod = 'paystack';
  } else if (!pm.paystack_enabled && !pm.manual_enabled && pm.hubtel_enabled && !pm.korapay_enabled && !pm.moolre_enabled && !pm.moolre_web_enabled) {
    depositMethod = 'hubtel';
  } else if (pm.paystack_enabled || pm.manual_enabled || pm.hubtel_enabled || pm.korapay_enabled || pm.moolre_enabled || pm.moolre_web_enabled) {
    depositMethod = pm.moolre_web_enabled ? 'moolre_web' :
      (pm.moolre_enabled ? 'moolre' :
        (pm.paystack_enabled ? 'paystack' :
          (pm.manual_enabled ? 'manual' :
            (pm.hubtel_enabled ? 'hubtel' : 'korapay'))));
  }

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
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    placeholderData: DEFAULT_PAYMENT_SETTINGS // Use defaults while loading
  });

  // Manage selected deposit method state locally to allow UI switching
  const [depositMethod, setDepositMethod] = useState(data?.depositMethod);

  // Update local state when default changes (e.g. data loads) if not set
  useEffect(() => {
    if (data?.depositMethod && !depositMethod) {
      setDepositMethod(data.depositMethod);
    }
  }, [data?.depositMethod]);

  return {
    depositMethod: depositMethod || data?.depositMethod,
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
