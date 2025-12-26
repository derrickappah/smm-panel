import React from 'react';
import { useNavigate } from 'react-router-dom';
import SEO from '@/components/SEO';
import Navbar from '@/components/Navbar';
import { generateBreadcrumbSchema } from '@/utils/schema';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useTerms } from '@/hooks/useTerms';
import { formatTermsText } from '@/utils/formatText';

const TermsPage = ({ user, onLogout }) => {
  const navigate = useNavigate();
  const { data: termsData, isLoading } = useTerms();

  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: 'Home', url: '/' },
    { name: 'Terms and Conditions', url: '/terms' }
  ]);

  const keywords = [
    'terms and conditions',
    'terms of service',
    'user agreement',
    'BoostUp GH terms',
    'SMM panel terms'
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={user} onLogout={onLogout} />
      <SEO
        title="Terms and Conditions - BoostUp GH | Social Media Marketing Panel"
        description="Read our terms and conditions for using BoostUp GH SMM panel services. Understand your rights and responsibilities when using our platform."
        keywords={keywords}
        canonical="/terms"
        structuredDataArray={[breadcrumbSchema]}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 md:pt-6 pb-6 sm:pb-8">
        {/* Header Section */}
        <div className="mb-6 sm:mb-8 animate-fadeIn">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2">
            Terms and Conditions
          </h1>
          <p className="text-sm sm:text-base text-gray-600">
            Last Updated: {termsData?.updated_at
              ? new Date(termsData.updated_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
              : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        {/* Terms Content */}
        <div>
          {isLoading ? (
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-12 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-4" />
              <p className="text-gray-600">Loading terms and conditions...</p>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 sm:p-8 lg:p-10">
              <div className="prose prose-sm sm:prose-base max-w-none">
                {termsData?.content ? (
                  <div className="text-gray-700 leading-relaxed">
                    {formatTermsText(termsData.content)}
                  </div>
                ) : (
                  <p className="text-gray-500 italic">Terms and conditions content not available.</p>
                )}
              </div>
              <div className="mt-8 pt-6 border-t border-gray-200">
                <p className="text-sm text-gray-500">
                  By using BoostUp GH, you acknowledge that you have read, understood, and agree to be bound by these Terms and Conditions.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TermsPage;

