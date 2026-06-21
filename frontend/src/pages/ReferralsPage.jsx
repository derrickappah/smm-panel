import React from 'react';
import Navbar from '@/components/Navbar';
import ReferralSection from '@/components/ReferralSection';
import SEO from '@/components/SEO';

const ReferralsPage = ({ user, onLogout }) => {
  return (
    <div className="min-h-screen bg-gray-50">
      <SEO 
        title="Referrals" 
        description="Invite your friends to BoostUpGH and earn rewards"
        canonical="/referrals"
      />
      <Navbar user={user} onLogout={onLogout} />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 md:pt-8 pb-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Referral Program</h1>
          <p className="text-gray-600 mt-2">Earn rewards by inviting your friends to join BoostUpGH</p>
        </div>
        
        <ReferralSection user={user} />
      </div>
    </div>
  );
};

export default ReferralsPage;
