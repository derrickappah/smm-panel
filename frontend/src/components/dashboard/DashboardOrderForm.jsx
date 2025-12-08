import React, { useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Layers } from 'lucide-react';

const DashboardOrderForm = React.memo(({ 
  services, 
  orderForm, 
  setOrderForm, 
  handleOrder, 
  loading 
}) => {
  const [serviceSearch, setServiceSearch] = useState('');
  const [selectOpen, setSelectOpen] = useState(false);

  const selectedService = useMemo(() => 
    services.find(s => s.id === orderForm.service_id),
    [services, orderForm.service_id]
  );

  const filteredServices = useMemo(() => {
    if (!serviceSearch.trim()) return services;
    const searchLower = serviceSearch.toLowerCase();
    return services.filter(service => 
      service.name?.toLowerCase().includes(searchLower) ||
      service.platform?.toLowerCase().includes(searchLower) ||
      service.service_type?.toLowerCase().includes(searchLower) ||
      service.description?.toLowerCase().includes(searchLower)
    );
  }, [services, serviceSearch]);

  const estimatedCost = useMemo(() => {
    if (!selectedService || !orderForm.quantity) return '0.00';
    
    const quantity = parseInt(orderForm.quantity);
    if (isNaN(quantity) || quantity <= 0) return '0.00';
    
    if (selectedService.is_combo && selectedService.combo_service_ids?.length > 0) {
      const componentServices = selectedService.combo_service_ids
        .map(serviceId => services.find(s => s.id === serviceId))
        .filter(s => s !== undefined);
      
      if (componentServices.length === 0) {
        return ((quantity / 1000) * selectedService.rate).toFixed(2);
      }
      
      const totalCost = componentServices.reduce((sum, componentService) => {
        return sum + ((quantity / 1000) * componentService.rate);
      }, 0);
      
      return totalCost.toFixed(2);
    }
    
    return ((quantity / 1000) * selectedService.rate).toFixed(2);
  }, [selectedService, orderForm.quantity, services]);

  const handleServiceSearchChange = useCallback((e) => {
    const value = e.target.value;
    setServiceSearch(value);
    if (value.length > 0 && services.length > 0) {
      setSelectOpen(true);
    } else if (value.length === 0 && services.length > 0) {
      setSelectOpen(true);
    }
  }, [services.length]);

  const handleServiceSelect = useCallback((serviceId) => {
    setOrderForm(prev => ({ ...prev, service_id: serviceId }));
    setServiceSearch('');
    setSelectOpen(false);
  }, [setOrderForm]);

  const handleSearchFocus = useCallback(() => {
    if (services.length > 0) {
      setSelectOpen(true);
    }
  }, [services.length]);

  const handleSearchBlur = useCallback(() => {
    setTimeout(() => {
      const activeElement = document.activeElement;
      if (!activeElement || !activeElement.closest('.service-dropdown-container')) {
        setSelectOpen(false);
      }
    }, 150);
  }, []);

  const handleLinkChange = useCallback((e) => {
    setOrderForm(prev => ({ ...prev, link: e.target.value }));
  }, [setOrderForm]);

  const handleQuantityChange = useCallback((e) => {
    setOrderForm(prev => ({ ...prev, quantity: e.target.value }));
  }, [setOrderForm]);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 sm:p-8 shadow-sm animate-slideUp" id="order-form-section">
      <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6">Place New Order</h2>
      <form onSubmit={handleOrder} className="space-y-4">
        <div className="relative">
          <Label htmlFor="service" className="text-sm font-medium text-gray-700 mb-2 block">Service</Label>
          <div className="relative service-dropdown-container">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none z-20" />
            <Input
              type="text"
              placeholder="Search services by name, platform, or type..."
              value={serviceSearch}
              onChange={handleServiceSearchChange}
              onFocus={handleSearchFocus}
              onBlur={handleSearchBlur}
              className="w-full h-11 rounded-lg border-gray-300 pl-10 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 z-10"
              autoComplete="off"
              id="service-search-input"
            />
            
            {selectOpen && (
              <div 
                className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-[300px] overflow-y-auto"
                onMouseDown={(e) => e.preventDefault()}
              >
                {filteredServices.length === 0 ? (
                  <div className="px-4 py-6 text-center text-sm text-gray-500">
                    No services found matching "{serviceSearch}"
                  </div>
                ) : (
                  <div className="p-1">
                    {filteredServices.map((service) => (
                      <div
                        key={service.id}
                        onClick={() => handleServiceSelect(service.id)}
                        className="px-3 py-2 rounded-md hover:bg-gray-100 cursor-pointer transition-colors focus-within:bg-gray-100"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleServiceSelect(service.id);
                          }
                        }}
                      >
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">{service.name}</span>
                            {service.is_combo && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium rounded">
                                <Layers className="w-3 h-3" />
                                Combo
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-gray-500">
                            {service.platform && `${service.platform} • `}₵{service.rate}/1000
                            {service.is_combo && service.combo_service_ids && (
                              <span className="ml-2 text-purple-600">
                                ({service.combo_service_ids.length} services)
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          
          <Select 
            value={orderForm.service_id || ''}
            onValueChange={() => {}}
            style={{ display: 'none' }}
          >
            <SelectTrigger style={{ display: 'none' }}>
              <SelectValue />
            </SelectTrigger>
          </Select>
          
          {orderForm.service_id && selectedService && (
            <div className="mt-3 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
              <p className="text-sm font-medium text-gray-900">
                Selected: {selectedService.name}
              </p>
              <p className="text-xs text-gray-600 mt-0.5">
                ₵{selectedService.rate}/1000
              </p>
            </div>
          )}
          
          {serviceSearch && (
            <p className="text-xs text-gray-500 mt-2">
              {filteredServices.length} service{filteredServices.length !== 1 ? 's' : ''} found
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="link" className="text-sm font-medium text-gray-700 mb-2 block">Link</Label>
          <Input
            id="link"
            data-testid="order-link-input"
            type="url"
            placeholder="put your link here"
            value={orderForm.link}
            onChange={handleLinkChange}
            className="w-full h-11 rounded-lg border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        <div>
          <Label htmlFor="quantity" className="text-sm font-medium text-gray-700 mb-2 block">Quantity</Label>
          <Input
            id="quantity"
            data-testid="order-quantity-input"
            type="number"
            placeholder="1000"
            value={orderForm.quantity}
            onChange={handleQuantityChange}
            className="w-full h-11 rounded-lg border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
          {selectedService && (
            <div className="mt-2 space-y-1">
              <p className="text-xs sm:text-sm text-gray-600">
                Min: {selectedService.min_quantity} | Max: {selectedService.max_quantity}
              </p>
              {selectedService.is_combo && selectedService.combo_service_ids && (
                <div className="mt-2 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                  <p className="text-xs font-medium text-purple-900 mb-1.5 flex items-center gap-1">
                    <Layers className="w-3 h-3" />
                    Combo includes:
                  </p>
                  <ul className="text-xs text-purple-700 space-y-0.5">
                    {selectedService.combo_service_ids.map((serviceId) => {
                      const componentService = services.find(s => s.id === serviceId);
                      return componentService ? (
                        <li key={serviceId} className="flex items-center gap-1.5">
                          <span className="w-1 h-1 bg-purple-500 rounded-full"></span>
                          {componentService.name} (₵{componentService.rate}/1000)
                        </li>
                      ) : null;
                    })}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="bg-indigo-50 border border-indigo-200 p-4 rounded-lg">
          <p className="text-xs sm:text-sm text-gray-600 mb-1">Estimated Cost</p>
          <p data-testid="order-estimated-cost" className="text-xl sm:text-2xl font-bold text-indigo-600">₵{estimatedCost}</p>
        </div>

        <Button
          data-testid="order-submit-btn"
          type="submit"
          disabled={loading || !orderForm.service_id}
          className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Processing...' : 'Place Order'}
        </Button>
      </form>
    </div>
  );
});

DashboardOrderForm.displayName = 'DashboardOrderForm';

export default DashboardOrderForm;

