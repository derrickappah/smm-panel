import React from 'react';
import { useNavigate } from 'react-router-dom';
import SEO from '@/components/SEO';
import Navbar from '@/components/Navbar';
import { generateOrganizationSchema, generateBreadcrumbSchema } from '@/utils/schema';
import { Button } from '@/components/ui/button';
import { ArrowRight, TrendingUp, Shield, Clock, Users, Heart } from 'lucide-react';

const AboutPage = ({ user, onLogout }) => {
  const navigate = useNavigate();

  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: 'Home', url: '/' },
    { name: 'About', url: '/about' }
  ]);

  const organizationSchema = generateOrganizationSchema();

  const keywords = [
    'about BoostUp GH',
    'SMM panel about',
    'social media marketing company',
    'Ghana SMM panel',
    'BoostUp GH company',
    'about us'
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={user} onLogout={onLogout} />
      <SEO
        title="About Us - BoostUp GH | Social Media Marketing Panel"
        description="Learn about BoostUp GH, the leading SMM panel in Ghana. We provide reliable social media marketing services for Instagram, TikTok, YouTube, Facebook, and Twitter."
        keywords={keywords}
        canonical="/about"
        structuredDataArray={[organizationSchema, breadcrumbSchema]}
      />

      {/* Hero Section */}
      <section className="bg-gradient-to-br from-indigo-600 to-purple-600 text-white py-12 sm:py-16 lg:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">
              About BoostUp GH
            </h1>
            <p className="text-lg sm:text-xl text-indigo-100 max-w-2xl mx-auto">
              The leading SMM panel in Ghana, helping businesses and individuals grow their social media presence
            </p>
          </div>
        </div>
      </section>

      {/* Mission Section */}
      <section className="py-12 sm:py-16 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-center text-gray-900 mb-8">
            Our Mission
          </h2>
          <div className="space-y-6">
            <p className="text-lg text-gray-600 text-center leading-relaxed">
              At BoostUp GH, our mission is to provide reliable, affordable, and high-quality social media marketing services to help businesses and individuals grow their online presence. We believe that everyone deserves access to professional SMM services, regardless of their budget or experience level.
            </p>
            <div className="bg-indigo-50 border-l-4 border-indigo-600 p-6 rounded-r-lg">
              <h3 className="text-xl font-semibold text-gray-900 mb-3">Empowering Digital Growth</h3>
              <p className="text-gray-700 leading-relaxed">
                We are committed to democratizing social media marketing by making premium services accessible to everyone. Our mission extends beyond just providing services—we aim to empower entrepreneurs, content creators, and businesses across Ghana and beyond to achieve their digital marketing goals without breaking the bank.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 gap-6 mt-8">
              <div className="bg-gray-50 p-6 rounded-lg">
                <h4 className="font-semibold text-gray-900 mb-2">Our Vision</h4>
                <p className="text-gray-600 text-sm leading-relaxed">
                  To become the most trusted and innovative SMM panel in Africa, setting new standards for quality, reliability, and customer satisfaction in the social media marketing industry.
                </p>
              </div>
              <div className="bg-gray-50 p-6 rounded-lg">
                <h4 className="font-semibold text-gray-900 mb-2">Our Commitment</h4>
                <p className="text-gray-600 text-sm leading-relaxed">
                  We are dedicated to continuous improvement, staying ahead of industry trends, and providing exceptional value to our customers while maintaining the highest standards of service quality and ethical practices.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="py-12 sm:py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-center text-gray-900 mb-12">
            Our Values
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white border border-gray-200 rounded-lg p-6 text-center">
              <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                <Shield className="w-6 h-6 text-indigo-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Reliability</h3>
              <p className="text-sm text-gray-600">We deliver on our promises with consistent, high-quality service.</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-6 text-center">
              <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                <TrendingUp className="w-6 h-6 text-indigo-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Innovation</h3>
              <p className="text-sm text-gray-600">We stay ahead of the curve with the latest SMM technologies and strategies.</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-6 text-center">
              <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                <Heart className="w-6 h-6 text-indigo-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Customer Focus</h3>
              <p className="text-sm text-gray-600">Your success is our success. We're committed to your satisfaction.</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-6 text-center">
              <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                <Clock className="w-6 h-6 text-indigo-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">24/7 Support</h3>
              <p className="text-sm text-gray-600">We're always here to help, whenever you need us.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-12 sm:py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-center text-gray-900 mb-12">
            Our Impact
          </h2>
          <div className="grid sm:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="text-4xl font-bold text-indigo-600 mb-2">10K+</div>
              <p className="text-gray-600">Happy Customers</p>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-indigo-600 mb-2">1M+</div>
              <p className="text-gray-600">Orders Completed</p>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-indigo-600 mb-2">99.9%</div>
              <p className="text-gray-600">Uptime</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-12 sm:py-16 bg-indigo-600 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-4">
            Ready to Grow Your Social Media Presence?
          </h2>
          <p className="text-lg text-indigo-100 mb-8">
            Join thousands of satisfied customers and start growing today.
          </p>
          {user ? (
            <Button
              onClick={() => navigate('/dashboard')}
              size="lg"
              className="bg-white text-indigo-600 hover:bg-gray-100"
            >
              Go to Dashboard
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          ) : (
            <Button
              onClick={() => navigate('/auth')}
              size="lg"
              className="bg-white text-indigo-600 hover:bg-gray-100"
            >
              Get Started Free
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          )}
        </div>
      </section>
    </div>
  );
};

export default AboutPage;

