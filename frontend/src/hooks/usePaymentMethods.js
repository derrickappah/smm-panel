import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';

// Global cache for payment settings to prevent redundant fetches and slow UI
let cachedPaymentSettings = null;
let cachedMinDepositSettings = null;
let cachedManualDepositDetails = null;
let cachedWhatsAppNumber = null;
let cachedDepositMethod = null;
let prefetchPromise = null;

// Standalone function to prefetch payment settings
export const prefetchPaymentSettings = async () => {
  if (cachedPaymentSettings && cachedMinDepositSettings && cachedManualDepositDetails) {
    return {
      paymentMethodSettings: cachedPaymentSettings,
      minDepositSettings: cachedMinDepositSettings,
      minDepositSettings: cachedMinDepositSettings,
      manualDepositDetails: cachedManualDepositDetails,
      whatsappNumber: cachedWhatsAppNumber,
      depositMethod: cachedDepositMethod
    };
  }

  if (prefetchPromise) {
    return prefetchPromise;
  }

  prefetchPromise = (async () => {
    try {
      console.log('Prefetching payment method settings...');

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
        console.warn('Error fetching payment method settings:', error);
        prefetchPromise = null;
        return null;
      }

      if (data && data.length > 0) {
        const settings = {};
        data.forEach(setting => {
          settings[setting.key] = setting.value;
        });

        cachedPaymentSettings = {
          paystack_enabled: settings.payment_method_paystack_enabled === 'true',
          manual_enabled: settings.payment_method_manual_enabled === 'true',
          hubtel_enabled: settings.payment_method_hubtel_enabled === 'true',
          korapay_enabled: settings.payment_method_korapay_enabled === 'true',
          moolre_enabled: settings.payment_method_moolre_enabled === 'true',
          moolre_web_enabled: settings.payment_method_moolre_web_enabled === 'true'
        };

        cachedMinDepositSettings = {
          paystack_min: parseFloat(settings.payment_method_paystack_min_deposit) || 10,
          manual_min: parseFloat(settings.payment_method_manual_min_deposit) || 10,
          hubtel_min: parseFloat(settings.payment_method_hubtel_min_deposit) || 1,
          korapay_min: parseFloat(settings.payment_method_korapay_min_deposit) || 1,
          moolre_min: parseFloat(settings.payment_method_moolre_min_deposit) || 1,
          moolre_web_min: parseFloat(settings.payment_method_moolre_web_min_deposit) || 1
        };

        cachedManualDepositDetails = {
          phone_number: settings.manual_deposit_phone_number || '0559272762',
          account_name: settings.manual_deposit_account_name || 'MTN - APPIAH MANASSEH ATTAH',
          instructions: settings.manual_deposit_instructions || 'Make PAYMENT to 0559272762\nMTN - APPIAH MANASSEH ATTAH\nuse your USERNAME as reference\nsend SCREENSHOT of PAYMENT when done'
        };

        cachedWhatsAppNumber = settings.whatsapp_number || '0500865092';

        // Auto-select method based on what's enabled
        if (!cachedPaymentSettings.paystack_enabled && cachedPaymentSettings.manual_enabled && !cachedPaymentSettings.hubtel_enabled && !cachedPaymentSettings.korapay_enabled && !cachedPaymentSettings.moolre_enabled && !cachedPaymentSettings.moolre_web_enabled) {
          cachedDepositMethod = 'manual';
        } else if (cachedPaymentSettings.paystack_enabled && !cachedPaymentSettings.manual_enabled && !cachedPaymentSettings.hubtel_enabled && !cachedPaymentSettings.korapay_enabled && !cachedPaymentSettings.moolre_enabled && !cachedPaymentSettings.moolre_web_enabled) {
          cachedDepositMethod = 'paystack';
        } else if (!cachedPaymentSettings.paystack_enabled && !cachedPaymentSettings.manual_enabled && cachedPaymentSettings.hubtel_enabled && !cachedPaymentSettings.korapay_enabled && !cachedPaymentSettings.moolre_enabled && !cachedPaymentSettings.moolre_web_enabled) {
          cachedDepositMethod = 'hubtel';
        } else if (cachedPaymentSettings.paystack_enabled || cachedPaymentSettings.manual_enabled || cachedPaymentSettings.hubtel_enabled || cachedPaymentSettings.korapay_enabled || cachedPaymentSettings.moolre_enabled || cachedPaymentSettings.moolre_web_enabled) {
          cachedDepositMethod = cachedPaymentSettings.moolre_web_enabled ? 'moolre_web' :
            (cachedPaymentSettings.moolre_enabled ? 'moolre' :
              (cachedPaymentSettings.paystack_enabled ? 'paystack' :
                (cachedPaymentSettings.manual_enabled ? 'manual' :
                  (cachedPaymentSettings.hubtel_enabled ? 'hubtel' : 'korapay'))));
        } else {
          cachedDepositMethod = null;
        }

        prefetchPromise = null;
        return {
          paymentMethodSettings: cachedPaymentSettings,
          minDepositSettings: cachedMinDepositSettings,
          minDepositSettings: cachedMinDepositSettings,
          manualDepositDetails: cachedManualDepositDetails,
          whatsappNumber: cachedWhatsAppNumber,
          depositMethod: cachedDepositMethod
        };
      }

      prefetchPromise = null;
      return null;
    } catch (error) {
      console.error('Error prefetching payment method settings:', error);
      prefetchPromise = null;
      return null;
    }
  })();

  return prefetchPromise;
};

export const usePaymentMethods = () => {
  const [depositMethod, setDepositMethod] = useState(cachedDepositMethod);
  const hasLoadedSettings = useRef(false);
  const [paymentMethodSettings, setPaymentMethodSettings] = useState(cachedPaymentSettings || {
    paystack_enabled: false,
    manual_enabled: false,
    hubtel_enabled: false,
    korapay_enabled: false,
    moolre_enabled: false,
    moolre_web_enabled: false
  });
  const [minDepositSettings, setMinDepositSettings] = useState(cachedMinDepositSettings || {
    paystack_min: 10,
    manual_min: 10,
    hubtel_min: 1,
    korapay_min: 1,
    moolre_min: 1,
    min_deposit_moolre_web: 1
  });
  const [manualDepositDetails, setManualDepositDetails] = useState(cachedManualDepositDetails || {
    phone_number: '0559272762',
    account_name: 'MTN - APPIAH MANASSEH ATTAH',
    instructions: 'Make PAYMENT to 0559272762\nMTN - APPIAH MANASSEH ATTAH\nuse your USERNAME as reference\nsend SCREENSHOT of PAYMENT when done'
  });
  const [whatsappNumber, setWhatsappNumber] = useState(cachedWhatsAppNumber || '0500865092');

  const fetchPaymentSettings = useCallback(async (force = false) => {
    if (!force && cachedPaymentSettings && !hasLoadedSettings.current) {
      setPaymentMethodSettings(cachedPaymentSettings);
      setMinDepositSettings(cachedMinDepositSettings);
      setManualDepositDetails(cachedManualDepositDetails);
      setWhatsappNumber(cachedWhatsAppNumber);
      setDepositMethod(cachedDepositMethod);
      hasLoadedSettings.current = true;
      return;
    }

    const data = await prefetchPaymentSettings();
    if (data) {
      setPaymentMethodSettings(data.paymentMethodSettings);
      setMinDepositSettings(data.minDepositSettings);
      setManualDepositDetails(data.manualDepositDetails);
      setWhatsappNumber(data.whatsappNumber);
      setDepositMethod(data.depositMethod);
      hasLoadedSettings.current = true;
    }
  }, []);

  useEffect(() => {
    // If we already have cached data, don't show loading state
    if (cachedPaymentSettings && !hasLoadedSettings.current) {
      setPaymentMethodSettings(cachedPaymentSettings);
      setMinDepositSettings(cachedMinDepositSettings);
      setManualDepositDetails(cachedManualDepositDetails);
      setWhatsappNumber(cachedWhatsAppNumber);
      setDepositMethod(cachedDepositMethod);
      hasLoadedSettings.current = true;
    } else if (!hasLoadedSettings.current) {
      fetchPaymentSettings();
    }

    // Ensure PaystackPop is loaded
    if (!window.PaystackPop && !document.querySelector('script[src*="paystack"]')) {
      const script = document.createElement('script');
      script.src = 'https://js.paystack.co/v1/inline.js';
      script.async = true;
      script.onload = () => console.log('Paystack script loaded successfully');
      document.head.appendChild(script);
    }
  }, [fetchPaymentSettings]);

  return {
    depositMethod,
    setDepositMethod,
    paymentMethodSettings,
    minDepositSettings,
    manualDepositDetails,
    whatsappNumber,
    fetchPaymentSettings,
  };
};


