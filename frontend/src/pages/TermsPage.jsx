import React from 'react';
import { useNavigate } from 'react-router-dom';
import SEO from '@/components/SEO';
import Navbar from '@/components/Navbar';
import { generateBreadcrumbSchema } from '@/utils/schema';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useTerms } from '@/hooks/useTerms';

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

      {/* Header Section */}
      <section className="bg-gradient-to-br from-indigo-600 to-purple-600 text-white py-8 sm:py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <Button
            onClick={() => navigate(-1)}
            variant="ghost"
            className="mb-4 text-white hover:bg-white/10"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <h1 className="text-3xl sm:text-4xl font-bold mb-2">
            Terms and Conditions
          </h1>
          <p className="text-indigo-100">
            Last Updated: {termsData?.updated_at 
              ? new Date(termsData.updated_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
              : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
      </section>

      {/* Terms Content */}
      <section className="py-8 sm:py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {isLoading ? (
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-12 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-4" />
              <p className="text-gray-600">Loading terms and conditions...</p>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 sm:p-8 lg:p-10">
              <div className="prose prose-sm sm:prose-base max-w-none whitespace-pre-wrap">
                {termsData?.content ? (
                  <p className="text-gray-700 leading-relaxed">{termsData.content}</p>
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

          {/* Action Buttons */}
          <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
            {user ? (
              <Button
                onClick={() => navigate('/dashboard')}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                Go to Dashboard
              </Button>
            ) : (
              <Button
                onClick={() => navigate('/auth')}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                Sign Up
              </Button>
            )}
            <Button
              onClick={() => navigate(-1)}
              variant="outline"
            >
              Go Back
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default TermsPage;

