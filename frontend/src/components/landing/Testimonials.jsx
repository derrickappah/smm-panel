import React from 'react';
import { Star, Quote } from 'lucide-react';
import { Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext } from '@/components/ui/carousel';

const Testimonials = () => {
  const testimonials = [
    {
      name: 'Sarah M.',
      initials: 'SM',
      location: 'Ghana',
      text: 'Amazing service! Got 10K Instagram followers in just 2 days. The quality is outstanding and the support team is always helpful.',
      rating: 5
    },
    {
      name: 'John K.',
      initials: 'JK',
      location: 'Nigeria',
      text: 'Best SMM panel I\'ve used. Fast delivery, real followers, and great prices. Highly recommend to anyone looking to grow their social media.',
      rating: 5
    },
    {
      name: 'Ama B.',
      initials: 'AB',
      location: 'Ghana',
      text: 'The TikTok views service worked perfectly! My videos started getting more engagement immediately. Customer service is top-notch.',
      rating: 5
    },
    {
      name: 'David T.',
      initials: 'DT',
      location: 'Kenya',
      text: 'I\'ve tried many SMM panels, but BoostUp GH is by far the most reliable. Orders are always completed on time and the followers are real.',
      rating: 5
    },
    {
      name: 'Fatima A.',
      initials: 'FA',
      location: 'Ghana',
      text: 'Great experience from start to finish. Easy to use platform, instant delivery, and the YouTube subscribers I got are all active accounts.',
      rating: 5
    }
  ];

  return (
    <section className="py-12 sm:py-16 lg:py-20 px-4 sm:px-6 bg-gradient-to-b from-white to-gray-50">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-8 sm:mb-12">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-3 sm:mb-4">
            What Our Customers Say
          </h2>
          <p className="text-base sm:text-lg text-gray-600 max-w-2xl mx-auto">
            Join thousands of satisfied customers who trust BoostUp GH for their social media growth
          </p>
        </div>
        <Carousel
          opts={{
            align: "start",
            loop: true,
          }}
          className="w-full"
        >
          <CarouselContent>
            {testimonials.map((testimonial, index) => (
              <CarouselItem key={index} className="md:basis-1/2 lg:basis-1/3">
                <div className="h-full">
                  <div className="bg-white border border-gray-200 rounded-lg p-6 sm:p-8 h-full flex flex-col shadow-sm hover:shadow-md transition-shadow duration-200">
                    <Quote className="w-8 h-8 text-indigo-600 mb-4" />
                    <p className="text-sm sm:text-base text-gray-700 mb-4 flex-grow">
                      "{testimonial.text}"
                    </p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 bg-indigo-100 rounded-full flex items-center justify-center">
                          <span className="text-indigo-600 font-semibold text-sm sm:text-base">
                            {testimonial.initials}
                          </span>
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900 text-sm sm:text-base">
                            {testimonial.name}
                          </p>
                          <p className="text-xs sm:text-sm text-gray-600">
                            {testimonial.location}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-1">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            className={`w-4 h-4 ${
                              i < testimonial.rating
                                ? 'text-yellow-400 fill-yellow-400'
                                : 'text-gray-300'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious className="hidden md:flex -left-12" />
          <CarouselNext className="hidden md:flex -right-12" />
        </Carousel>
        <div className="text-center mt-8 sm:mt-12">
          <p className="text-sm sm:text-base text-gray-600">
            <span className="font-semibold text-gray-900">10,000+</span> happy customers and counting
          </p>
        </div>
      </div>
    </section>
  );
};

export default Testimonials;

