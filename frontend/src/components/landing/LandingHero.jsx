import React from 'react';
import { ArrowRight, Zap, Shield, TrendingUp, Star, CheckCircle2 } from 'lucide-react';
import { LandingForm } from './LandingForm';

export const LandingHero = () => {
    return (
        <section className="relative pt-24 pb-20 lg:pt-32 lg:pb-32 overflow-hidden">
            {/* Dynamic Background Elements */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full -z-10">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/20 blur-[120px] rounded-full animate-pulse" />
                <div className="absolute bottom-[10%] right-[-5%] w-[35%] h-[35%] bg-purple-600/20 blur-[100px] rounded-full animate-pulse delay-700" />
                <div className="absolute top-[20%] right-[15%] w-[25%] h-[25%] bg-blue-500/10 blur-[80px] rounded-full animate-pulse delay-1000" />
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="grid lg:grid-cols-2 gap-2 lg:gap-20 items-center">
                    {/* Content Side */}
                    <div className="text-left space-y-3 animate-in fade-in slide-in-from-left-8 duration-700">
                        <h1 className="text-5xl font-bold sm:text-5xl sm:font-extrabold lg:text-6xl tracking-tight text-gray-900 leading-[1.10]">
                            Grow Your Social Media <br className="hidden sm:block" />
                            <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 bg-[length:200%_auto] animate-gradient font-extrabold">Instantly</span> 🚀
                        </h1>

                        <p className="text-sm sm:text-base text-gray-600 max-w-xl leading-relaxed">
                            Become part of thousands of Brands and Influencers who have boosted their social media presence through BoostUp GH, the most reliable social media platform.
                        </p>

                        {/* Feature List - Compact single row */}
                        <div className="flex items-center gap-x-4 sm:gap-x-6 pt-1">
                            {[
                                { icon: CheckCircle2, text: '24/7 Support', color: 'text-green-500' },
                                { icon: Shield, text: '100% Real', color: 'text-blue-500' },
                                { icon: Zap, text: 'Instant', color: 'text-orange-500' },
                                { icon: TrendingUp, text: 'Secure', color: 'text-indigo-500' },
                            ].map((item, i) => (
                                <div key={i} className="flex items-center gap-x-1.5 text-gray-600 font-medium text-[10px] sm:text-xs whitespace-nowrap">
                                    <item.icon className={`${item.color} shrink-0`} size={13} />
                                    <span>{item.text}</span>
                                </div>
                            ))}
                        </div>

                        {/* Social Proof Mini */}
                        <div className="pt-3 border-t border-gray-100/80">
                            <div className="flex items-center space-x-4">
                                <div className="flex -space-x-3">
                                    {[
                                        '/avatar_user_1_1771801032120.png',
                                        '/avatar_user_2_1771801048478.png',
                                        '/avatar_user_3_1771801061535.png',
                                        '/avatar_user_4_1771801077527.png',
                                    ].map((src, i) => (
                                        <div key={i} className="w-12 h-12 rounded-full border-4 border-white overflow-hidden shadow-sm hover:translate-y-[-4px] transition-transform duration-300">
                                            <img src={src} alt={`User ${i + 1}`} className="w-full h-full object-cover" />
                                        </div>
                                    ))}
                                    <div className="w-12 h-12 rounded-full border-4 border-white bg-indigo-600 flex items-center justify-center text-xs font-black text-white shadow-md hover:translate-y-[-4px] transition-transform duration-300">
                                        100k+
                                    </div>
                                </div>
                                <div>
                                    <div className="flex text-amber-400 mb-0.5">
                                        {[1, 2, 3, 4, 5].map((s) => <Star key={s} size={16} className="fill-current" />)}
                                    </div>
                                    <p className="text-sm text-gray-500 font-bold">Used by <span className="text-indigo-600">100K+</span> creators</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Form Side */}
                    <div className="relative lg:mt-0 mt-2 animate-in fade-in slide-in-from-right-8 duration-700 delay-200">
                        {/* Decorative background for form */}
                        <div className="absolute inset-0 bg-indigo-600/5 rounded-[40px] -rotate-2 scale-105 -z-10" />
                        <div className="absolute inset-0 bg-purple-600/5 rounded-[40px] rotate-1 scale-105 -z-10" />

                        <LandingForm />

                        {/* Absolute floating elements */}
                        <div className="absolute -top-6 -right-6 bg-white p-4 rounded-2xl shadow-xl hidden sm:block animate-bounce duration-[3000ms]">
                            <div className="flex items-center space-x-3">
                                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                                    <TrendingUp size={20} className="text-green-600" />
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 font-medium">Auto-Delivery</p>
                                    <p className="text-sm font-bold text-gray-900">1.2s avg speed</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};
