import React from 'react';
import { Users, Wallet, ArrowRight } from 'lucide-react';

const ReferralPromoCard = ({ onAction }) => {
  return (
    <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 flex flex-col md:flex-row items-center justify-between gap-8 overflow-hidden relative group animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Decorative background element */}
      <div className="absolute -top-24 -right-24 w-64 h-64 bg-purple-50 rounded-full blur-3xl opacity-50 group-hover:opacity-70 transition-opacity duration-500" />
      
      {/* Left Content */}
      <div className="flex-1 space-y-6 z-10">
        <div className="w-14 h-14 bg-purple-50 rounded-2xl flex items-center justify-center">
          <Users className="w-7 h-7 text-purple-600" />
        </div>
        
        <div className="space-y-3">
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 leading-[1.1] tracking-tight">
            Invite Your <br />
            <span className="text-purple-600">Friends & Earn</span>
          </h2>
          <p className="text-gray-500 text-lg max-w-md">
            Invite your friends to <span className="text-purple-600 font-semibold">BoostUpGH</span> and earn <span className="text-purple-600 font-semibold">100 GH Cedis</span> every day.
          </p>
        </div>

        <button 
          onClick={onAction}
          className="flex items-center gap-2 text-purple-600 font-bold text-xl hover:gap-3 transition-all duration-300 group/btn focus:outline-none"
        >
          Start Earning Now
          <ArrowRight className="w-6 h-6 transition-transform group-hover/btn:translate-x-1" />
        </button>
      </div>

      {/* Right Graphic */}
      <div className="relative w-64 h-64 flex items-center justify-center shrink-0">
        {/* Decorative Rings */}
        <div className="absolute inset-0 border-[1.5px] border-dashed border-purple-100 rounded-full animate-spin [animation-duration:30s]" />
        <div className="absolute inset-6 border-[1.5px] border-dashed border-purple-200/60 rounded-full animate-spin [animation-duration:20s] [animation-direction:reverse]" />
        
        {/* Main Circle */}
        <div className="relative w-44 h-44 bg-white rounded-full shadow-[0_8px_30px_rgba(147,51,234,0.08)] flex flex-col items-center justify-center border border-purple-50/50">
          <div className="mb-2.5 bg-purple-50/50 p-2 rounded-lg">
            <Wallet className="w-7 h-7 text-purple-600" />
          </div>
          <div className="text-center">
            <span className="block text-3xl font-bold text-purple-600 tracking-tight">100 GH</span>
            <span className="text-[11px] text-gray-400 font-bold uppercase tracking-[0.2em] mt-0.5">Every Day</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReferralPromoCard;
