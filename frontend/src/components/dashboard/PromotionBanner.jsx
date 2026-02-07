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
                    align: "center",
                    loop: true,
                }}
                className="w-full"
            >
                <CarouselContent className="-ml-2 md:-ml-4">
                    {packages.map((pkg) => (
                        <CarouselItem key={pkg.id} className="pl-2 md:pl-4 basis-[85%] sm:basis-[70%] md:basis-1/2 lg:basis-1/3">
                            <div
                                className="relative bg-white border-2 border-purple-200 rounded-2xl p-4 sm:p-5 shadow-xl transition-all duration-300 hover:shadow-2xl hover:border-purple-300 cursor-pointer h-full min-h-[190px] flex flex-col"
                                onClick={() => handlePackageClick(pkg)}
                            >
                                {/* Header: Platform Badge and Price */}
                                <div className="flex items-start justify-between mb-2">
                                    <div className="flex items-center gap-2 px-2 py-1 bg-purple-50 rounded-lg border border-purple-100">
                                        <Tag className="w-3.5 h-3.5 text-purple-600" />
                                        <span className="text-[10px] sm:text-xs font-bold text-purple-600 lowercase tracking-tight">
                                            {pkg.platform || 'promotion'}
                                        </span>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-lg sm:text-xl font-black text-purple-600 leading-none">
                                            {pkg.price} GHS
                                        </div>
                                        <span className="text-[10px] text-gray-400 font-medium">Fixed Price</span>
                                    </div>
                                </div>

                                {/* Body: Title and Details */}
                                <div className="flex-1 space-y-1.5 mb-3">
                                    <h3 className="text-sm sm:text-base font-bold text-gray-900 leading-snug line-clamp-2">
                                        {pkg.name}
                                    </h3>
                                    <div className="flex flex-col gap-0.5">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-semibold text-gray-700">Quantity:</span>
                                            <span className="text-xs font-bold text-gray-600">{formatQuantity(pkg.quantity)}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Footer: Buy Now Button */}
                                <Button
                                    className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold h-9 sm:h-10 rounded-xl shadow-md hover:shadow-lg transition-all active:scale-[0.98]"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handlePackageClick(pkg);
                                    }}
                                >
                                    Buy Now
                                </Button>
                            </div>
                        </CarouselItem>
                    ))}
                </CarouselContent>
            </Carousel>

            {/* Pagination Indicators and Swipe Hint */}
            <div className="flex flex-col items-center gap-3 mt-4">
                <div className="flex justify-center gap-1.5">
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

                <div className="flex items-center gap-2 text-purple-600/60 transition-opacity duration-300 animate-pulse">
                    <span className="text-[10px] sm:text-xs font-bold tracking-widest uppercase">
                        &lt; swipe for more &gt;
                    </span>
                </div>
            </div>
        </div>
    );
};

export default PromotionBanner;
