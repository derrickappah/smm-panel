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
  whatsappNumber: '0500865092',
  depositMethod: 'moolre_web' // Default method
};

// ... (fetchPaymentSettingsFn and legacy support remain the same)

export const usePaymentMethods = () => {
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: PAYMENT_SETTINGS_QUERY_KEY,
    queryFn: fetchPaymentSettingsFn,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
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

