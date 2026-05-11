import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

const ReferralTracker = () => {
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const ref = searchParams.get('ref');
    if (ref) {
      // Store in localStorage for persistence across pages/sessions
      localStorage.setItem('referral_code', ref.trim());
      console.log('Referral code captured and stored:', ref.trim());
    }
  }, [searchParams]);

  return null;
};

export default ReferralTracker;
