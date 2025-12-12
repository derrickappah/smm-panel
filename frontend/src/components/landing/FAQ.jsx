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
    },
    {
      question: 'Why are my likes reducing?',
      answer: 'When you buy likes, TikTok sometimes reduces them after a few days — especially around the 6th day. This is TikTok\'s automated system detecting and removing engagement it considers suspicious.\n\n⭐ Solution 1: Delete and Restore Method\nA simple trick to avoid this loss is to delete the video and restore it after a few minutes or hours. This refreshes the video and helps keep your purchased likes safe.\n\nHow to Restore a Deleted TikTok Video:\n1. Open TikTok\n2. Go to Your Profile (bottom right)\n3. Tap the three lines (☰) in the top-right\n4. Tap Settings and Privacy\n5. Go to Activity Center\n6. Tap Recently Deleted\n7. Find your video\n8. Tap it, then tap Restore\n\n⭐ Solution 2: Hide Video Method\nIf you bought 1,000 likes on Monday, wait until Friday evening or Saturday morning and then hide the video. Keep it hidden for 48 hours (until Monday), and then make the video visible again. By doing this, the likes will stay permanently.\n\n⚠ Disclaimer: Even if you buy likes, views, or comments without a refill policy, there is still a way to prevent them from dropping. Most drops usually happen about one week after purchasing, and we have methods to avoid that.'
    },
    {
      question: 'What Is a Refill Policy?',
      answer: 'A refill policy means that if your order (likes, views, or comments) drops after some time, the site will automatically replace them for you at no extra cost.\n\nSo when you\'re buying likes, views, or comments, always check whether the service has:\n• Refill Policy ➜ They will replace any drops\n• No Refill ➜ They won\'t restore anything if the numbers go down\n\n⚠ Disclaimer: Even if you buy likes, views, or comments without a refill policy, there is still a way to prevent them from dropping. Most drops usually happen about one week after purchasing, and we have methods to avoid that.'
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

