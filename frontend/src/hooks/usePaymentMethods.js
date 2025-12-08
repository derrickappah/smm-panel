import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export const usePaymentMethods = () => {
  const [depositMethod, setDepositMethod] = useState(null);
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

  const fetchPaymentSettings = useCallback(async () => {
    try {
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
      
      if (!error && data) {
        const settings = {};
        data.forEach(setting => {
          settings[setting.key] = setting.value;
        });
        const newSettings = {
          paystack_enabled: settings.payment_method_paystack_enabled !== 'false',
          manual_enabled: settings.payment_method_manual_enabled !== 'false',
          hubtel_enabled: settings.payment_method_hubtel_enabled !== 'false',
          korapay_enabled: settings.payment_method_korapay_enabled !== 'false'
        };
        setPaymentMethodSettings(newSettings);
        
        // Set minimum deposit settings with fallback to defaults
        setMinDepositSettings({
          paystack_min: parseFloat(settings.payment_method_paystack_min_deposit) || 10,
          manual_min: parseFloat(settings.payment_method_manual_min_deposit) || 10,
          hubtel_min: parseFloat(settings.payment_method_hubtel_min_deposit) || 1,
          korapay_min: parseFloat(settings.payment_method_korapay_min_deposit) || 1
        });
        
        // Auto-select method based on what's enabled
        if (!newSettings.paystack_enabled && newSettings.manual_enabled && !newSettings.hubtel_enabled) {
          setDepositMethod('manual');
        } else if (newSettings.paystack_enabled && !newSettings.manual_enabled && !newSettings.hubtel_enabled) {
          setDepositMethod('paystack');
        } else if (!newSettings.paystack_enabled && !newSettings.manual_enabled && newSettings.hubtel_enabled) {
          setDepositMethod('hubtel');
        } else if (newSettings.paystack_enabled || newSettings.manual_enabled || newSettings.hubtel_enabled) {
          // At least one enabled, default to paystack if available, else first available
          setDepositMethod(
            newSettings.paystack_enabled ? 'paystack' : 
            (newSettings.manual_enabled ? 'manual' : 'hubtel')
          );
        } else {
          // All disabled
          setDepositMethod(null);
        }
      }
    } catch (error) {
      console.warn('Error fetching payment method settings:', error);
      // Default to both enabled if settings can't be fetched
    }
  }, []);

  useEffect(() => {
    fetchPaymentSettings().catch((error) => {
      console.error('Error fetching payment settings:', error);
    });

    // Ensure PaystackPop is loaded
    if (!window.PaystackPop && !document.querySelector('script[src*="paystack"]')) {
      const script = document.createElement('script');
      script.src = 'https://js.paystack.co/v1/inline.js';
      script.async = true;
      script.onerror = (error) => {
        console.warn('Failed to load Paystack script:', error);
      };
      script.onload = () => {
        console.log('Paystack script loaded successfully');
      };
      document.head.appendChild(script);
    }
  }, [fetchPaymentSettings]);

  return {
    depositMethod,
    setDepositMethod,
    paymentMethodSettings,
    minDepositSettings,
    fetchPaymentSettings,
  };
};

