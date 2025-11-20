import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { axiosInstance } from '@/App';
import Navbar from '@/components/Navbar';
import { Instagram, Youtube, Facebook, Twitter } from 'lucide-react';

const ServicesPage = ({ user, onLogout }) => {
  const [services, setServices] = useState([]);
  const [selectedPlatform, setSelectedPlatform] = useState('all');
  const [loading, setLoading] = useState(true);

  const platforms = [
    { id: 'all', name: 'All Services', icon: null },
    { id: 'instagram', name: 'Instagram', icon: Instagram, color: 'from-pink-500 to-purple-600' },
    { id: 'tiktok', name: 'TikTok', icon: null, color: 'from-gray-700 to-gray-900' },
    { id: 'youtube', name: 'YouTube', icon: Youtube, color: 'from-red-500 to-red-600' },
    { id: 'facebook', name: 'Facebook', icon: Facebook, color: 'from-blue-500 to-blue-600' },
    { id: 'twitter', name: 'Twitter', icon: Twitter, color: 'from-sky-400 to-sky-600' },
  ];

  useEffect(() => {
    fetchServices();
  }, [selectedPlatform]);

  const fetchServices = async () => {
    setLoading(true);
    try {
      const endpoint = selectedPlatform === 'all' ? '/services' : `/services?platform=${selectedPlatform}`;
      const response = await axiosInstance.get(endpoint);
      setServices(response.data);
    } catch (error) {
      console.error('Error fetching services:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredServices = selectedPlatform === 'all' 
    ? services 
    : services.filter(s => s.platform === selectedPlatform);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <Navbar user={user} onLogout={onLogout} />

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8 animate-fadeIn">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Our Services</h1>
          <p className="text-gray-600">Browse all available services across platforms</p>
        </div>

        {/* Platform Filter */}
        <div className="flex gap-3 mb-8 overflow-x-auto pb-2 animate-slideUp">
          {platforms.map((platform) => (
            <Button
              key={platform.id}
              data-testid={`filter-${platform.id}-btn`}
              onClick={() => setSelectedPlatform(platform.id)}
              className={`flex items-center space-x-2 rounded-full px-6 py-3 whitespace-nowrap ${
                selectedPlatform === platform.id
                  ? `bg-gradient-to-r ${platform.color || 'from-indigo-600 to-purple-600'} text-white`
                  : 'bg-white/50 text-gray-700 hover:bg-white/80'
              }`}
            >
              {platform.icon && <platform.icon className="w-4 h-4" />}
              <span>{platform.name}</span>
            </Button>
          ))}
        </div>

        {/* Services Grid */}
        {loading ? (
          <div className="text-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-indigo-600 mx-auto"></div>
          </div>
        ) : filteredServices.length === 0 ? (
          <div className="glass p-12 rounded-3xl text-center">
            <p className="text-gray-600 text-lg">No services available for this platform yet.</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 animate-slideUp">
            {filteredServices.map((service, index) => (
              <div
                key={service.id}
                data-testid={`service-card-${service.id}`}
                className="glass p-6 rounded-2xl card-hover"
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <span className="text-xs font-medium px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full">
                      {service.platform}
                    </span>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-indigo-600">${service.rate}</p>
                    <p className="text-xs text-gray-600">per 1000</p>
                  </div>
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">{service.name}</h3>
                <p className="text-sm text-gray-600 mb-4">{service.description}</p>
                <div className="flex justify-between text-xs text-gray-600 pt-4 border-t border-gray-200">
                  <span>Min: {service.min_quantity}</span>
                  <span>Max: {service.max_quantity}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ServicesPage;