import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SEO from '@/components/SEO';
import Navbar from '@/components/Navbar';
import { generateBreadcrumbSchema } from '@/utils/schema';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, HelpCircle, Bell, Video, MessageCircleQuestion, Play } from 'lucide-react';
import { useFAQ } from '@/hooks/useFAQ';
import { useUpdates } from '@/hooks/useUpdates';
import { useVideoTutorials } from '@/hooks/useVideoTutorials';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

const FAQPage = ({ user, onLogout }) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('faq');
  const [playingVideoId, setPlayingVideoId] = useState(null);
  const [failedThumbnails, setFailedThumbnails] = useState(new Set());
  const { data: faqs = [], isLoading: faqsLoading } = useFAQ();
  const { data: updates = [], isLoading: updatesLoading } = useUpdates();
  const { data: tutorials = [], isLoading: tutorialsLoading } = useVideoTutorials();

  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: 'Home', url: '/' },
    { name: 'FAQ', url: '/faq' }
  ]);

  const keywords = [
    'FAQ',
    'frequently asked questions',
    'BoostUp GH FAQ',
    'SMM panel FAQ',
    'help',
    'questions',
    'answers'
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={user} onLogout={onLogout} />
      <SEO
        title="FAQ - BoostUp GH | Social Media Marketing Panel"
        description="Find answers to frequently asked questions about BoostUp GH SMM panel services. Learn about our services, payment methods, delivery times, and more."
        keywords={keywords}
        canonical="/faq"
        structuredDataArray={[breadcrumbSchema]}
      />

      {/* Header Section */}
      <section className="bg-gradient-to-br from-indigo-600 to-purple-600 text-white py-8 sm:py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl sm:text-4xl font-bold mb-2">
            FAQ & Updates
          </h1>
          <p className="text-indigo-100 text-lg">
            Find answers, stay updated, and learn with video tutorials
          </p>
        </div>
      </section>

      {/* Content Section with Tabs */}
      <section className="py-8 sm:py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-6">
              <TabsTrigger value="faq" className="flex items-center gap-2">
                <MessageCircleQuestion className="w-4 h-4" />
                <span className="hidden sm:inline">FAQ</span>
              </TabsTrigger>
              <TabsTrigger value="updates" className="flex items-center gap-2">
                <Bell className="w-4 h-4" />
                <span className="hidden sm:inline">Updates</span>
              </TabsTrigger>
              <TabsTrigger value="tutorials" className="flex items-center gap-2">
                <Video className="w-4 h-4" />
                <span className="hidden sm:inline">Tutorials</span>
              </TabsTrigger>
            </TabsList>

            {/* FAQ Tab */}
            <TabsContent value="faq">
              {faqsLoading ? (
                <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-12 text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-4" />
                  <p className="text-gray-600">Loading FAQs...</p>
                </div>
              ) : faqs.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-12 text-center">
                  <HelpCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h2 className="text-xl font-semibold text-gray-900 mb-2">No FAQs Available</h2>
                  <p className="text-gray-600 mb-6">
                    We're currently updating our FAQ section. Please check back soon or contact our support team for assistance.
                  </p>
                  {user ? (
                    <Button
                      onClick={() => navigate('/support')}
                      className="bg-indigo-600 hover:bg-indigo-700"
                    >
                      Contact Support
                    </Button>
                  ) : (
                    <Button
                      onClick={() => navigate('/auth')}
                      className="bg-indigo-600 hover:bg-indigo-700"
                    >
                      Sign Up
                    </Button>
                  )}
                </div>
              ) : (
                <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 sm:p-8 lg:p-10">
                  <Accordion type="single" collapsible className="w-full">
                    {faqs.map((faq, index) => (
                      <AccordionItem 
                        key={faq.id || index} 
                        value={`item-${faq.id || index}`} 
                        className="border-b border-gray-200 last:border-b-0"
                      >
                        <AccordionTrigger className="text-left text-base sm:text-lg font-semibold text-gray-900 hover:text-indigo-600 py-4 sm:py-6 px-0">
                          {faq.question}
                        </AccordionTrigger>
                        <AccordionContent className="text-sm sm:text-base text-gray-600 leading-relaxed pb-4 sm:pb-6 whitespace-pre-line">
                          {faq.answer}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </div>
              )}
            </TabsContent>

            {/* Updates Tab */}
            <TabsContent value="updates">
              {updatesLoading ? (
                <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-12 text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-4" />
                  <p className="text-gray-600">Loading updates...</p>
                </div>
              ) : updates.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-12 text-center">
                  <Bell className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h2 className="text-xl font-semibold text-gray-900 mb-2">No Updates Available</h2>
                  <p className="text-gray-600">
                    Check back soon for the latest updates and announcements.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {updates.map((update) => (
                    <div key={update.id} className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-gray-900 mb-2">{update.title}</h3>
                          <div className="flex items-center gap-2 mb-3">
                            <span className={`px-2 py-1 text-xs font-medium rounded ${
                              update.type === 'announcement' ? 'bg-indigo-100 text-indigo-800' :
                              update.type === 'update' ? 'bg-green-100 text-green-800' :
                              'bg-purple-100 text-purple-800'
                            }`}>
                              {update.type}
                            </span>
                            {update.priority === 'urgent' && (
                              <span className="px-2 py-1 text-xs font-medium rounded bg-red-100 text-red-800">
                                Urgent
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="text-xs text-gray-500">
                          {new Date(update.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="text-gray-700 leading-relaxed whitespace-pre-line">
                        {update.content}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Video Tutorials Tab */}
            <TabsContent value="tutorials">
              {tutorialsLoading ? (
                <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-12 text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-4" />
                  <p className="text-gray-600">Loading tutorials...</p>
                </div>
              ) : tutorials.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-12 text-center">
                  <Video className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h2 className="text-xl font-semibold text-gray-900 mb-2">No Video Tutorials Available</h2>
                  <p className="text-gray-600">
                    Video tutorials will be available here soon.
                  </p>
                </div>
              ) : (
                <div className="grid gap-6 sm:grid-cols-2">
                  {tutorials.map((tutorial) => {
                    // Debug: Log thumbnail URL
                    if (tutorial.thumbnail_url) {
                      console.log('Tutorial thumbnail URL:', tutorial.id, tutorial.thumbnail_url);
                    }
                    
                    // Check if it's a YouTube URL
                    const isYouTube = tutorial.video_url?.includes('youtube.com') || tutorial.video_url?.includes('youtu.be');
                    const getYouTubeEmbedUrl = (url) => {
                      if (!url) return null;
                      // Extract video ID from various YouTube URL formats
                      const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
                      const match = url.match(regExp);
                      const videoId = match && match[2].length === 11 ? match[2] : null;
                      return videoId ? `https://www.youtube.com/embed/${videoId}?autoplay=1` : null;
                    };
                    
                    const embedUrl = isYouTube ? getYouTubeEmbedUrl(tutorial.video_url) : null;
                    const isPlaying = playingVideoId === tutorial.id;
                    
                    return (
                      <div key={tutorial.id} className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                        {isPlaying ? (
                          <div className="aspect-video bg-black">
                            {embedUrl ? (
                              <iframe
                                src={embedUrl}
                                title={tutorial.title}
                                className="w-full h-full"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                              />
                            ) : (
                              <video
                                src={tutorial.video_url}
                                controls
                                autoPlay
                                className="w-full h-full"
                                onEnded={() => setPlayingVideoId(null)}
                              >
                                Your browser does not support the video tag.
                              </video>
                            )}
                          </div>
                        ) : (
                          tutorial.thumbnail_url && !failedThumbnails.has(tutorial.id) ? (
                            <div 
                              className="aspect-video bg-gray-100 relative group cursor-pointer overflow-hidden" 
                              onClick={() => setPlayingVideoId(tutorial.id)}
                            >
                              <img 
                                src={tutorial.thumbnail_url} 
                                alt={tutorial.title}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  console.error('Failed to load thumbnail for tutorial:', tutorial.id, tutorial.thumbnail_url);
                                  setFailedThumbnails(prev => new Set(prev).add(tutorial.id));
                                }}
                                loading="lazy"
                              />
                              <div className="absolute inset-0 bg-black/40 group-hover:bg-black/50 flex items-center justify-center transition-colors pointer-events-none">
                                <div className="w-16 h-16 bg-white/90 rounded-full flex items-center justify-center">
                                  <Play className="w-8 h-8 text-indigo-600 ml-1" />
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div 
                              className="aspect-video bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center cursor-pointer group hover:from-indigo-200 hover:to-purple-200 transition-colors"
                              onClick={() => setPlayingVideoId(tutorial.id)}
                            >
                              <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                                <Play className="w-8 h-8 text-indigo-600 ml-1" />
                              </div>
                            </div>
                          )
                        )}
                        <div className="p-4">
                          {tutorial.category && (
                            <span className="inline-block px-2 py-1 text-xs font-medium rounded bg-indigo-100 text-indigo-800 mb-2">
                              {tutorial.category}
                            </span>
                          )}
                          <h3 className="text-lg font-semibold text-gray-900 mb-2">{tutorial.title}</h3>
                          {tutorial.description && (
                            <p className="text-sm text-gray-600 mb-3 line-clamp-2">{tutorial.description}</p>
                          )}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4 text-xs text-gray-500">
                              {tutorial.duration && (
                                <span>Duration: {Math.floor(tutorial.duration / 60)}:{(tutorial.duration % 60).toString().padStart(2, '0')}</span>
                              )}
                              <span>Views: {tutorial.views || 0}</span>
                            </div>
                            {!isPlaying && (
                              <Button
                                size="sm"
                                onClick={() => setPlayingVideoId(tutorial.id)}
                                className="bg-indigo-600 hover:bg-indigo-700"
                              >
                                <Play className="w-3 h-3 mr-1" />
                                Play
                              </Button>
                            )}
                            {isPlaying && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setPlayingVideoId(null)}
                              >
                                Close
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>

          {/* Action Buttons */}
          <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
            {user ? (
              <>
                <Button
                  onClick={() => navigate('/dashboard')}
                  className="bg-indigo-600 hover:bg-indigo-700"
                >
                  Go to Dashboard
                </Button>
                <Button
                  onClick={() => navigate('/support')}
                  variant="outline"
                >
                  Contact Support
                </Button>
              </>
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

export default FAQPage;

