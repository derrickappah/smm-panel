import React, { useEffect, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Carousel,
    CarouselContent,
    CarouselItem
} from "@/components/ui/carousel";
import { Button } from '@/components/ui/button';
import { Sparkles, ArrowRight, Tag, Layers, Clock, Zap } from 'lucide-react';
import { cn } from "@/lib/utils";

const PromotionBanner = ({ packages, onPackageSelect, user }) => {
    const navigate = useNavigate();
    const [api, setApi] = useState(null);
    const [currentIndex, setCurrentIndex] = useState(0);

    const formatQuantity = (quantity) => {
        if (quantity >= 1000000) return `${(quantity / 1000000).toFixed(1)}M`;
        if (quantity >= 1000) return `${(quantity / 1000).toFixed(1)}K`;
        return quantity.toString();
    };

    const getPlatformStyles = (platform) => {
        const p = platform?.toLowerCase();
        if (p?.includes('instagram')) return "from-rose-500 via-purple-600 to-indigo-600";
        if (p?.includes('tiktok')) return "from-black via-gray-800 to-red-600";
        if (p?.includes('youtube')) return "from-red-600 to-crimson-800";
        if (p?.includes('twitter') || p?.includes('x')) return "from-sky-400 to-blue-600";
        if (p?.includes('facebook')) return "from-blue-600 to-blue-800";
        if (p?.includes('whatsapp')) return "from-green-500 to-emerald-600";
        if (p?.includes('telegram')) return "from-blue-400 to-indigo-500";
        return "from-indigo-600 to-purple-600";
    };

    // Track active slide
    useEffect(() => {
        if (!api) return;

        const onSelect = () => {
            setCurrentIndex(api.selectedScrollSnap());
        };

        api.on("select", onSelect);
        onSelect(); // Initialize

        return () => {
            api.off("select", onSelect);
        };
    }, [api]);

    // Autoplay implementation
    useEffect(() => {
        if (!api) return;

        const intervalId = setInterval(() => {
            if (api.canScrollNext()) {
                api.scrollNext();
            } else {
                api.scrollTo(0);
            }
        }, 5000);

        return () => clearInterval(intervalId);
    }, [api]);

    if (!packages || packages.length === 0) return null;

    const handlePackageClick = (pkg) => {
        if (onPackageSelect) {
            onPackageSelect(pkg);
        } else {
            navigate('/dashboard', { state: { selectedPackageId: pkg.id } });
        }
    };

    return (
        <div className="w-full mb-8">
            <Carousel
                setApi={setApi}
                opts={{
                    align: "start",
                    loop: true,
                }}
                className="w-full"
            >
                <CarouselContent className="-ml-2 md:-ml-4">
                    {packages.map((pkg) => (
                        <CarouselItem key={pkg.id} className="pl-2 md:pl-4 basis-full md:basis-1/2 lg:basis-1/3">
                            <div
                                className={cn(
                                    "relative h-36 sm:h-44 md:h-48 rounded-2xl overflow-hidden group cursor-pointer transition-all duration-500 hover:scale-[1.02] hover:shadow-2xl shadow-xl",
                                    "bg-gradient-to-br",
                                    getPlatformStyles(pkg.platform)
                                )}
                                onClick={() => handlePackageClick(pkg)}
                            >
                                {/* Decorative background elements */}
                                <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-white/10 rounded-full blur-3xl group-hover:bg-white/20 transition-colors duration-700"></div>
                                <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-48 h-48 bg-black/10 rounded-full blur-2xl group-hover:bg-black/20 transition-colors duration-700"></div>

                                <div className="relative h-full p-4 sm:p-5 flex flex-col justify-between text-white">
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <div className="p-1.5 bg-white/20 backdrop-blur-md rounded-lg">
                                                    <Tag className="w-3.5 h-3.5" />
                                                </div>
                                                <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider bg-white/20 backdrop-blur-md px-2 py-0.5 rounded-full border border-white/30">
                                                    {pkg.platform}
                                                </span>
                                            </div>
                                            <div className="bg-white/20 backdrop-blur-md px-2 py-0.5 rounded-full border border-white/30 flex items-center gap-1">
                                                <Zap className="w-2.5 h-2.5 text-yellow-300" />
                                                <span className="text-[10px] sm:text-xs font-bold">Offer</span>
                                            </div>
                                        </div>

                                        <h3 className="text-lg sm:text-xl font-black mb-1 line-clamp-1 group-hover:translate-x-1 transition-transform duration-300">
                                            {pkg.name}
                                        </h3>

                                        {pkg.is_combo && (
                                            <div className="flex items-center gap-1">
                                                <Clock className="w-3.5 h-3.5 text-white/70" />
                                                <span className="text-xs font-medium">Combo Deal</span>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex items-end justify-between mt-auto">
                                        <div className="flex items-center gap-3">
                                            <div className="flex items-baseline gap-1">
                                                <span className="text-2xl font-black leading-none">{pkg.price}</span>
                                                <span className="text-2xl font-black opacity-80 leading-none">₵</span>
                                            </div>
                                            <div className="flex items-center gap-2 opacity-90 border-l border-white/30 pl-3">
                                                <span className="text-2xl font-black leading-none tracking-tight">
                                                    {formatQuantity(pkg.quantity)}
                                                </span>
                                            </div>
                                        </div>
                                        <Button
                                            className="bg-white text-gray-900 hover:bg-gray-100 font-bold h-8 sm:h-9 px-4 sm:px-6 rounded-xl group/btn text-xs sm:text-sm"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handlePackageClick(pkg);
                                            }}
                                        >
                                            Buy Now
                                            <ArrowRight className="ml-1 sm:ml-2 w-3.5 h-3.5 group-hover/btn:translate-x-1 transition-transform" />
                                        </Button>
                                    </div>
                                </div>

                                {/* Hover overlay hint */}
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors duration-300 pointer-events-none"></div>
                            </div>
                        </CarouselItem>
                    ))}
                </CarouselContent>
            </Carousel>

            {/* Pagination Indicators */}
            <div className="flex justify-center gap-1.5 mt-4">
                {packages.map((_, index) => (
                    <button
                        key={index}
                        className={cn(
                            "h-1.5 rounded-full transition-all duration-300",
                            currentIndex === index
                                ? "w-6 bg-purple-600 shadow-sm"
                                : "w-1.5 bg-gray-300 hover:bg-gray-400"
                        )}
                        onClick={() => api?.scrollTo(index)}
                        aria-label={`Go to slide ${index + 1}`}
                    />
                ))}
            </div>
        </div>
    );
};

export default PromotionBanner;
