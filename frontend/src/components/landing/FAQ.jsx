import React from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

const FAQ = () => {
  const faqs = [
    {
      question: 'Is this service safe for my account?',
      answer: 'Yes, absolutely! We use only safe, organic methods that comply with platform guidelines. Your account security is our top priority, and we\'ve never had any issues with account bans or restrictions.'
    },
    {
      question: 'How fast is the delivery?',
      answer: 'Most orders start within minutes of payment confirmation. The speed depends on the service type and quantity ordered. Smaller orders (under 1,000) typically complete within 24-48 hours, while larger orders may take a few days to ensure quality delivery.'
    },
    {
      question: 'What payment methods do you accept?',
      answer: 'We accept multiple secure payment methods including Paystack (credit/debit cards), Korapay, Hubtel, and manual bank deposits. All payments are processed securely and your account balance is updated instantly upon verification.'
    },
    {
      question: 'Are the followers/likes/views real?',
      answer: 'We provide high-quality engagement from real, active accounts. While we can\'t guarantee 100% retention (as some accounts may become inactive over time), we use premium services that deliver authentic engagement from genuine users.'
    },
    {
      question: 'Can I get a refund if I\'m not satisfied?',
      answer: 'Yes! We offer a money-back guarantee. If you\'re not satisfied with our service, contact our support team within 7 days of your order, and we\'ll work with you to resolve the issue or provide a full refund.'
    },
    {
      question: 'Do you offer support if I have questions?',
      answer: 'Absolutely! We have a dedicated 24/7 support team ready to help you with any questions or concerns. You can reach us through the support section in your dashboard, and we typically respond within a few hours.'
    },
    {
      question: 'Can I order services for multiple platforms?',
      answer: 'Yes! You can order services for Instagram, TikTok, YouTube, Facebook, Twitter, and more. Simply add multiple services to your cart and checkout once. All orders are processed independently and efficiently.'
    }
  ];

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
            <AccordionItem key={index} value={`item-${index}`} className="border-b border-gray-200">
              <AccordionTrigger className="text-left text-base sm:text-lg font-semibold text-gray-900 hover:text-indigo-600 py-4 sm:py-6">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="text-sm sm:text-base text-gray-600 leading-relaxed pb-4 sm:pb-6">
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

