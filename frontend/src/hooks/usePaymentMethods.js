import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export const usePaymentMethods = () => {
  const [depositMethod, setDepositMethod] = useState(null);
  const [paymentMethodSettings, setPaymentMethodSettings] = useState({
    paystack_enabled: true,
    manual_enabled: true,
    hubtel_enabled: true,
    korapay_enabled: true,
    moolre_enabled: true,
    moolre_web_enabled: true
  });
  const [minDepositSettings, setMinDepositSettings] = useState({
    paystack_min: 10,
    manual_min: 10,
    hubtel_min: 1,
    korapay_min: 1,
    moolre_min: 1,
    moolre_web_min: 1
  });
  const [manualDepositDetails, setManualDepositDetails] = useState({
    phone_number: '0559272762',
    account_name: 'MTN - APPIAH MANASSEH ATTAH',
    instructions: 'Make PAYMENT to 0559272762\nMTN - APPIAH MANASSEH ATTAH\nuse your USERNAME as reference\nsend SCREENSHOT of PAYMENT when done'
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
          'manual_deposit_instructions'
        ]);
      
      if (error) {
        console.warn('Error fetching payment method settings:', error);
        // On error, use default settings and set default method
        setDepositMethod('paystack');
        return;
      }

      if (data && data.length > 0) {
        const settings = {};
        data.forEach(setting => {
          settings[setting.key] = setting.value;
        });
        const newSettings = {
          paystack_enabled: settings.payment_method_paystack_enabled !== 'false',
          manual_enabled: settings.payment_method_manual_enabled !== 'false',
          hubtel_enabled: settings.payment_method_hubtel_enabled !== 'false',
          korapay_enabled: settings.payment_method_korapay_enabled !== 'false',
          moolre_enabled: settings.payment_method_moolre_enabled !== 'false',
          moolre_web_enabled: settings.payment_method_moolre_web_enabled !== 'false'
        };
        setPaymentMethodSettings(newSettings);
        
        // Set minimum deposit settings with fallback to defaults
        setMinDepositSettings({
          paystack_min: parseFloat(settings.payment_method_paystack_min_deposit) || 10,
          manual_min: parseFloat(settings.payment_method_manual_min_deposit) || 10,
          hubtel_min: parseFloat(settings.payment_method_hubtel_min_deposit) || 1,
          korapay_min: parseFloat(settings.payment_method_korapay_min_deposit) || 1,
          moolre_min: parseFloat(settings.payment_method_moolre_min_deposit) || 1,
          moolre_web_min: parseFloat(settings.payment_method_moolre_web_min_deposit) || 1
        });
        
        // Set manual deposit details with fallback to defaults
        setManualDepositDetails({
          phone_number: settings.manual_deposit_phone_number || '0559272762',
          account_name: settings.manual_deposit_account_name || 'MTN - APPIAH MANASSEH ATTAH',
          instructions: settings.manual_deposit_instructions || 'Make PAYMENT to 0559272762\nMTN - APPIAH MANASSEH ATTAH\nuse your USERNAME as reference\nsend SCREENSHOT of PAYMENT when done'
        });
        
        // Auto-select method based on what's enabled
        if (!newSettings.paystack_enabled && newSettings.manual_enabled && !newSettings.hubtel_enabled && !newSettings.korapay_enabled && !newSettings.moolre_enabled && !newSettings.moolre_web_enabled) {
          setDepositMethod('manual');
        } else if (newSettings.paystack_enabled && !newSettings.manual_enabled && !newSettings.hubtel_enabled && !newSettings.korapay_enabled && !newSettings.moolre_enabled && !newSettings.moolre_web_enabled) {
          setDepositMethod('paystack');
        } else if (!newSettings.paystack_enabled && !newSettings.manual_enabled && newSettings.hubtel_enabled && !newSettings.korapay_enabled && !newSettings.moolre_enabled && !newSettings.moolre_web_enabled) {
          setDepositMethod('hubtel');
        } else if (newSettings.paystack_enabled || newSettings.manual_enabled || newSettings.hubtel_enabled || newSettings.korapay_enabled || newSettings.moolre_enabled || newSettings.moolre_web_enabled) {
          // At least one enabled, default to paystack if available, else first available
          setDepositMethod(
            newSettings.paystack_enabled ? 'paystack' : 
            (newSettings.manual_enabled ? 'manual' : 
            (newSettings.hubtel_enabled ? 'hubtel' :
            (newSettings.korapay_enabled ? 'korapay' : 
            (newSettings.moolre_web_enabled ? 'moolre_web' : 'moolre'))))
          );
        } else {
          // All disabled
          setDepositMethod(null);
        }
      } else {
        // No data returned, use defaults
        console.warn('No payment method settings found, using defaults');
        setDepositMethod('paystack');
      }
    } catch (error) {
      console.error('Error fetching payment method settings:', error);
      // Default to paystack if settings can't be fetched
      setDepositMethod('paystack');
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
    manualDepositDetails,
    fetchPaymentSettings,
  };
};

