import React from 'react';
import {
  Carousel,
  CarouselContent,
  CarouselItem
} from "@/components/ui/carousel";

const DashboardSkeleton = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar Skeleton */}
      <nav className="fixed md:sticky top-0 left-0 right-0 z-50 pointer-events-none">
        <div className="bg-white border-b border-gray-200 shadow-sm pointer-events-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
            <div className="flex items-center justify-between">
              {/* Logo placeholder */}
              <div className="flex items-center">
                <div className="h-8 sm:h-10 w-28 sm:w-36 bg-gray-200 rounded animate-pulse" />
              </div>

              {/* Desktop Nav Items placeholder */}
              <div className="hidden md:flex items-center space-x-1">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-9 w-20 bg-gray-100 rounded-lg animate-pulse" />
                ))}
                <div className="h-9 w-16 bg-gray-100 rounded-lg animate-pulse" />
              </div>

              {/* Action / menu placeholder */}
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="hidden md:block h-9 w-9 bg-gray-100 rounded-lg animate-pulse" />
                <div className="h-9 w-9 bg-gray-100 rounded-lg md:hidden animate-pulse" />
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 md:pt-6 pb-6 sm:pb-8">
        {/* Welcome Section Skeleton */}
        <div className="mb-3 sm:mb-4">
          <div className="h-5 sm:h-6 w-44 sm:w-56 bg-gray-200 rounded animate-pulse" />
        </div>

        {/* Promotion Packages Skeleton */}
        <div className="w-full mb-8">
          <Carousel
            opts={{
              align: "center",
              loop: true,
            }}
            className="w-full"
          >
            <CarouselContent className="-ml-2 md:-ml-4">
              {[1, 2, 3, 4].map((i) => (
                <CarouselItem key={i} className="pl-2 md:pl-4 basis-[85%] sm:basis-[70%] md:basis-1/2 lg:basis-1/3">
                  <div className="relative bg-white border-2 border-purple-200 rounded-2xl p-4 sm:p-5 min-h-[190px] flex flex-col justify-between animate-pulse">
                    <div className="flex items-start justify-between mb-2">
                      <div className="h-6 w-20 bg-purple-50 border border-purple-100 rounded-lg" />
                      <div className="h-6 w-16 bg-purple-100 rounded" />
                    </div>
                    <div className="space-y-2 mb-3">
                      <div className="h-4 w-3/4 bg-gray-200 rounded" />
                      <div className="h-3 w-1/2 bg-gray-200 rounded" />
                    </div>
                    <div className="h-9 sm:h-10 w-full bg-purple-200/80 rounded-xl" />
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>

          {/* Carousel Dots */}
          <div className="flex justify-center gap-1.5 mt-4">
            <div className="w-6 h-1.5 bg-purple-600/70 rounded-full animate-pulse shadow-sm" />
            <div className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-pulse" />
            <div className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-pulse" />
            <div className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-pulse" />
          </div>
        </div>

        {/* Stats Cards Skeleton */}
        <div className="grid grid-cols-2 gap-4 mb-6 sm:mb-8">
          {/* Current Balance Stat Card */}
          <div className="bg-white border-2 border-gray-300 rounded-lg p-4 sm:p-6 shadow-xl">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-green-100 rounded-lg shrink-0 flex items-center justify-center animate-pulse" />
              <div className="h-7 sm:h-9 w-24 sm:w-32 bg-gray-200 rounded animate-pulse" />
            </div>
            <div className="h-3.5 sm:h-4 w-24 sm:w-28 bg-gray-200 rounded animate-pulse mt-2" />
          </div>

          {/* Total Orders Stat Card */}
          <div className="bg-white border-2 border-gray-300 rounded-lg p-4 sm:p-6 shadow-xl">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-indigo-100 rounded-lg shrink-0 flex items-center justify-center animate-pulse" />
              <div className="h-7 sm:h-9 w-16 sm:w-20 bg-gray-200 rounded animate-pulse" />
            </div>
            <div className="h-3.5 sm:h-4 w-20 sm:w-24 bg-gray-200 rounded animate-pulse mt-2" />
          </div>
        </div>

        {/* 2-Column Grid (Deposit + Quick Order) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 items-start w-full min-w-0">
          {/* Left: Deposit Card Skeleton */}
          <div className="bg-white border-2 border-gray-300 rounded-lg p-6 sm:p-8 shadow-xl w-full min-w-0">
            <div className="h-7 sm:h-8 w-36 bg-gray-200 rounded mb-6 animate-pulse" />
            {/* Method tabs */}
            <div className="flex gap-2 mb-6 p-1 bg-gray-100 rounded-lg">
              <div className="flex-1 h-9 bg-white shadow-sm rounded-md animate-pulse" />
              <div className="flex-1 h-9 bg-gray-200/60 rounded-md animate-pulse" />
              <div className="flex-1 h-9 bg-gray-200/60 rounded-md animate-pulse" />
            </div>
            {/* Amount input */}
            <div className="space-y-4">
              <div>
                <div className="h-4 w-28 bg-gray-200 rounded mb-2 animate-pulse" />
                <div className="h-11 w-full bg-gray-50 border border-gray-300 rounded-lg animate-pulse" />
              </div>
              {/* Quick amount pills */}
              <div className="grid grid-cols-4 gap-2 mb-6">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-9 bg-gray-100 rounded-lg animate-pulse" />
                ))}
              </div>
              {/* Deposit button */}
              <div className="h-11 w-full bg-indigo-500/50 rounded-lg animate-pulse mb-6" />
              {/* Instructions box */}
              <div className="h-16 w-full bg-blue-50/70 border border-blue-200 rounded-lg animate-pulse" />
            </div>
          </div>

          {/* Right: Place Order Card Skeleton */}
          <div className="bg-white border-2 border-gray-300 rounded-lg p-6 sm:p-8 shadow-xl w-full min-w-0">
            <div className="h-7 sm:h-8 w-44 bg-gray-200 rounded mb-6 animate-pulse" />
            <div className="space-y-4">
              {/* Service selection */}
              <div>
                <div className="h-4 w-16 bg-gray-200 rounded mb-2 animate-pulse" />
                <div className="h-11 w-full bg-gray-50 border border-gray-300 rounded-lg animate-pulse" />
              </div>
              {/* Link input */}
              <div>
                <div className="h-4 w-12 bg-gray-200 rounded mb-2 animate-pulse" />
                <div className="h-11 w-full bg-gray-50 border border-gray-300 rounded-lg animate-pulse" />
              </div>
              {/* Quantity input */}
              <div>
                <div className="h-4 w-20 bg-gray-200 rounded mb-2 animate-pulse" />
                <div className="h-11 w-full bg-gray-50 border border-gray-300 rounded-lg animate-pulse" />
              </div>
              {/* Place Order button */}
              <div className="h-11 w-full bg-indigo-500/50 rounded-lg animate-pulse" />
            </div>
          </div>
        </div>

        {/* Recent Orders Skeleton */}
        <div className="mt-6 sm:mt-8 bg-white border-2 border-gray-300 rounded-lg p-4 sm:p-6 shadow-xl">
          <div className="flex items-center justify-between mb-4 gap-4">
            <div className="h-6 w-32 bg-gray-200 rounded animate-pulse" />
            <div className="h-6 w-20 bg-indigo-50 rounded-lg animate-pulse" />
          </div>
          <div className="h-20 bg-gray-50 border border-gray-200 rounded-lg p-3 sm:p-4 animate-pulse flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-200 rounded-lg shrink-0" />
              <div className="space-y-1.5">
                <div className="h-4 w-32 sm:w-48 bg-gray-200 rounded" />
                <div className="h-3 w-20 sm:w-32 bg-gray-200 rounded" />
              </div>
            </div>
            <div className="h-6 w-20 bg-gray-200 rounded-full shrink-0" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardSkeleton;
