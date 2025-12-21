import React from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { useFAQ } from '@/hooks/useFAQ';

const FAQ = () => {
  const { data: faqs = [], isLoading } = useFAQ();

  if (isLoading) {
    return (
      <section className="py-12 sm:py-16 lg:py-20 px-4 sm:px-6 bg-white">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8 sm:mb-12">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-3 sm:mb-4">
              Frequently Asked Questions
            </h2>
            <p className="text-base sm:text-lg text-gray-600">
              Everything you need to know about BoostUp GH
            </p>
          </div>
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-200 border-t-indigo-600 mx-auto"></div>
          </div>
        </div>
      </section>
    );
  }

  if (faqs.length === 0) {
    return null;
  }

  return (
    <section className="py-12 sm:py-16 lg:py-20 px-4 sm:px-6 bg-white">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8 sm:mb-12">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-3 sm:mb-4">
            Frequently Asked Questions
          </h2>
          <p className="text-base sm:text-lg text-gray-600">
            Everything you need to know about BoostUp GH
          </p>
        </div>
        <Accordion type="single" collapsible className="w-full">
          {faqs.map((faq, index) => (
            <AccordionItem key={faq.id || index} value={`item-${faq.id || index}`} className="border-b border-gray-200">
              <AccordionTrigger className="text-left text-base sm:text-lg font-semibold text-gray-900 hover:text-indigo-600 py-4 sm:py-6">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="text-sm sm:text-base text-gray-600 leading-relaxed pb-4 sm:pb-6 whitespace-pre-line">
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
};

export default FAQ;

