import React, { useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Layers, Tag } from 'lucide-react';

const DashboardOrderForm = React.memo(({
  services = [],
  packages = [],
  orderForm,
  setOrderForm,
  handleOrder,
  loading
}) => {
  const [serviceSearch, setServiceSearch] = useState('');
  const [selectOpen, setSelectOpen] = useState(false);

  // Sort services by display_order to match admin page ordering
  const sortedServices = useMemo(() => {
    return [...services].sort((a, b) => {
      const orderA = a.display_order ?? 0;
      const orderB = b.display_order ?? 0;
      if (orderA !== orderB) return orderA - orderB;
      // If display_order is same, sort by created_at descending
      const dateA = new Date(a.created_at || 0);
      const dateB = new Date(b.created_at || 0);
      return dateB - dateA;
    });
  }, [services]);

  const selectedService = useMemo(() =>
    sortedServices.find(s => s.id === orderForm.service_id),
    [sortedServices, orderForm.service_id]
  );

  const selectedPackage = useMemo(() =>
    packages.find(p => p.id === orderForm.package_id),
    [packages, orderForm.package_id]
  );

  const filteredServices = useMemo(() => {
    if (!serviceSearch.trim()) return sortedServices;
    const searchLower = serviceSearch.toLowerCase();
    return sortedServices.filter(service =>
      service.name?.toLowerCase().includes(searchLower) ||
      service.platform?.toLowerCase().includes(searchLower) ||
      service.service_type?.toLowerCase().includes(searchLower) ||
      service.description?.toLowerCase().includes(searchLower)
    );
  }, [sortedServices, serviceSearch]);

  const filteredPackages = useMemo(() => {
    if (!serviceSearch.trim()) return packages;
    const searchLower = serviceSearch.toLowerCase();
    return packages.filter(pkg =>
      pkg.name?.toLowerCase().includes(searchLower) ||
      pkg.platform?.toLowerCase().includes(searchLower) ||
      pkg.service_type?.toLowerCase().includes(searchLower) ||
      pkg.description?.toLowerCase().includes(searchLower)
    );
  }, [packages, serviceSearch]);

  const estimatedCost = useMemo(() => {
    // If package is selected, use fixed price
    if (selectedPackage) {
      return selectedPackage.price.toFixed(2);
    }

    // Otherwise calculate from service
    if (!selectedService || !orderForm.quantity) return '0.00';

    const quantity = parseInt(orderForm.quantity);
    if (isNaN(quantity) || quantity <= 0) return '0.00';

    if (selectedService.is_combo && selectedService.combo_service_ids?.length > 0) {
      const componentServices = selectedService.combo_service_ids
        .map(serviceId => sortedServices.find(s => s.id === serviceId))
        .filter(s => s !== undefined);

      if (componentServices.length === 0) {
        const rateUnit = selectedService.rate_unit || 1000;
        return ((quantity / rateUnit) * selectedService.rate).toFixed(2);
      }

      const totalCost = componentServices.reduce((sum, componentService) => {
        const rateUnit = componentService.rate_unit || 1000;
        return sum + ((quantity / rateUnit) * componentService.rate);
      }, 0);

      return totalCost.toFixed(2);
    }

    const rateUnit = selectedService.rate_unit || 1000;
    return ((quantity / rateUnit) * selectedService.rate).toFixed(2);
  }, [selectedService, selectedPackage, orderForm.quantity, sortedServices]);

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
    setOrderForm(prev => ({ ...prev, service_id: serviceId, package_id: '' }));
    setServiceSearch('');
    setSelectOpen(false);
  }, [setOrderForm]);

  const handlePackageSelect = useCallback((packageId) => {
    const pkg = packages.find(p => p.id === packageId);
    setOrderForm(prev => ({
      ...prev,
      package_id: packageId,
      service_id: '',
      quantity: pkg ? pkg.quantity.toString() : prev.quantity
    }));
    setServiceSearch('');
    setSelectOpen(false);
  }, [setOrderForm, packages]);

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

  const handleCommentsChange = useCallback((e) => {
    const comments = e.target.value;

    // Count non-empty lines for quantity
    const lineCount = comments.split('\n').filter(line => line.trim() !== '').length;

    setOrderForm(prev => ({
      ...prev,
      comments: comments,
      quantity: lineCount > 0 ? lineCount.toString() : ''
    }));
  }, [setOrderForm]);

  const isCustomCommentsService = useMemo(() => {
    if (!selectedService) return false;
    return selectedService.service_type === 'custom_comments' ||
      selectedService.name?.toLowerCase().includes('custom comments') ||
      selectedService.name?.toLowerCase().includes('custom comment');
  }, [selectedService]);

  // Helper function to parse markdown-style formatting (bold and italic)
  const formatDescription = useCallback((text) => {
    if (!text) return null;

    // Split by line breaks first to preserve them
    const lines = text.split('\n');
    const result = [];

    lines.forEach((line, lineIndex) => {
      // Process each line for formatting
      const parts = [];
      let currentIndex = 0;
      let keyCounter = 0;

      // Process bold (**text**) and italic (*text*) formatting
      while (currentIndex < line.length) {
        // Check for bold (**text**)
        const boldMatch = line.substring(currentIndex).match(/^\*\*([^*]+)\*\*/);
        if (boldMatch) {
          parts.push(
            <strong key={`part-${lineIndex}-${keyCounter++}`} className="font-semibold">
              {boldMatch[1]}
            </strong>
          );
          currentIndex += boldMatch[0].length;
          continue;
        }

        // Check for italic (*text*) - but not if it's part of bold
        const italicMatch = line.substring(currentIndex).match(/^\*([^*]+)\*/);
        if (italicMatch) {
          parts.push(
            <em key={`part-${lineIndex}-${keyCounter++}`} className="italic">
              {italicMatch[1]}
            </em>
          );
          currentIndex += italicMatch[0].length;
          continue;
        }

        // Find the next formatting marker
        const nextBold = line.indexOf('**', currentIndex);
        const nextItalic = line.indexOf('*', currentIndex);

        let nextMarker = -1;
        if (nextBold !== -1 && nextItalic !== -1) {
          nextMarker = Math.min(nextBold, nextItalic);
        } else if (nextBold !== -1) {
          nextMarker = nextBold;
        } else if (nextItalic !== -1) {
          nextMarker = nextItalic;
        }

        if (nextMarker !== -1) {
          parts.push(
            <span key={`part-${lineIndex}-${keyCounter++}`}>
              {line.substring(currentIndex, nextMarker)}
            </span>
          );
          currentIndex = nextMarker;
        } else {
          // No more formatting, add the rest of the line
          parts.push(
            <span key={`part-${lineIndex}-${keyCounter++}`}>
              {line.substring(currentIndex)}
            </span>
          );
          break;
        }
      }

      // Add the line content (even if empty, to preserve line breaks)
      if (parts.length > 0) {
        result.push(
          <span key={`line-${lineIndex}`}>
            {parts}
          </span>
        );
      } else {
        // Empty line - add a non-breaking space to preserve the line break
        result.push(
          <span key={`line-${lineIndex}`}>&nbsp;</span>
        );
      }

      // Add line break after each line except the last one
      if (lineIndex < lines.length - 1) {
        result.push(<br key={`br-${lineIndex}`} />);
      }
    });

    return result;
  }, []);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 sm:p-8 shadow-sm animate-slideUp" id="order-form-section">
      <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6">Place New Order</h2>
      <form onSubmit={handleOrder} className="space-y-4">
        <div className="relative">
          <Label htmlFor="service" className="text-sm font-medium text-gray-700 mb-2 block">Service or Package</Label>
          <div className="relative service-dropdown-container">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none z-20" />
            <Input
              type="text"
              placeholder="Search services or packages..."
              value={serviceSearch}
              onChange={handleServiceSearchChange}
              onFocus={handleSearchFocus}
              onBlur={handleSearchBlur}
              className="w-full h-11 rounded-lg border-gray-300 pl-10 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 z-10"
              autoComplete="off"
              id="service-search-input"
            />

            {selectOpen && (filteredServices.length > 0 || filteredPackages.length > 0) && (
              <div
                className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-[300px] overflow-y-auto"
                onMouseDown={(e) => e.preventDefault()}
              >
                <div className="p-1">
                  {filteredPackages.length > 0 && (
                    <>
                      <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase border-b border-gray-200">
                        Promotion Packages
                      </div>
                      {filteredPackages.map((pkg) => (
                        <div
                          key={`pkg-${pkg.id}`}
                          onClick={() => handlePackageSelect(pkg.id)}
                          className="px-3 py-2 rounded-md hover:bg-purple-50 cursor-pointer transition-colors focus-within:bg-purple-50 border-l-2 border-purple-300"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handlePackageSelect(pkg.id);
                            }
                          }}
                        >
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900">{pkg.name}</span>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium rounded">
                                <Tag className="w-3 h-3" />
                                Package
                              </span>
                            </div>
                            <span className="text-xs text-gray-500">
                              {pkg.platform && `${pkg.platform} • `}{pkg.price} GHS (Fixed)
                            </span>
                          </div>
                        </div>
                      ))}
                    </>
                  )}

                  {filteredServices.length > 0 && (
                    <>
                      {filteredPackages.length > 0 && (
                        <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase border-t border-b border-gray-200 mt-1">
                          Regular Services
                        </div>
                      )}
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
                              {service.platform && `${service.platform} • `}₵{service.rate}/{service.rate_unit || 1000}
                              {service.is_combo && service.combo_service_ids && (
                                <span className="ml-2 text-purple-600">
                                  ({service.combo_service_ids.length} services)
                                </span>
                              )}
                            </span>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          <Select
            value={orderForm.service_id || ''}
            onValueChange={() => { }}
            style={{ display: 'none' }}
          >
            <SelectTrigger style={{ display: 'none' }}>
              <SelectValue />
            </SelectTrigger>
          </Select>

          {orderForm.package_id && selectedPackage && (
            <div className="mt-3 p-3 bg-purple-50 border-2 border-purple-300 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <Tag className="w-4 h-4 text-purple-600" />
                <p className="text-sm font-medium text-gray-900">
                  Selected Package: {selectedPackage.name}
                </p>
              </div>
              <p className="text-xs text-gray-600 mt-0.5">
                Fixed Price: {selectedPackage.price} GHS • Quantity: {selectedPackage.quantity.toLocaleString()}
              </p>
            </div>
          )}

          {orderForm.service_id && selectedService && (
            <div className="mt-3 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
              <p className="text-sm font-medium text-gray-900">
                Selected: {selectedService.name}
              </p>
              <p className="text-xs text-gray-600 mt-0.5">
                ₵{selectedService.rate}/{selectedService.rate_unit || 1000}
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
            disabled={!!selectedPackage || isCustomCommentsService}
            className="w-full h-11 rounded-lg border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
          {selectedPackage && (
            <div className="mt-2 p-3 bg-purple-50 border border-purple-200 rounded-lg">
              <p className="text-xs text-purple-700">
                <span className="font-medium">Package Quantity:</span> {selectedPackage.quantity.toLocaleString()} (Fixed)
              </p>
            </div>
          )}
          {isCustomCommentsService && (
            <div className="mt-2 text-xs text-indigo-600 font-medium">
              Quantity is automatically set based on the number of comments ({orderForm.quantity || 0}).
            </div>
          )}
          {selectedService && !isCustomCommentsService && (
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
                      const componentService = sortedServices.find(s => s.id === serviceId);
                      return componentService ? (
                        <li key={serviceId} className="flex items-center gap-1.5">
                          <span className="w-1 h-1 bg-purple-500 rounded-full"></span>
                          {componentService.name} (₵{componentService.rate}/{componentService.rate_unit || 1000})
                        </li>
                      ) : null;
                    })}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {isCustomCommentsService && (
          <div className="animate-fadeIn">
            <Label htmlFor="comments" className="text-sm font-medium text-gray-700 mb-2 block">
              Custom Comments
              <span className="ml-1 text-xs font-normal text-gray-500">(One comment per line)</span>
            </Label>
            <textarea
              id="comments"
              data-testid="order-comments-input"
              placeholder="Nice post!&#10;Love this content&#10;Amazing work"
              value={orderForm.comments || ''}
              onChange={handleCommentsChange}
              rows={5}
              className="w-full rounded-lg border-blue-500 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-h-[120px] p-3 text-sm"
            />
          </div>
        )}

        <div className="bg-indigo-50 border border-indigo-200 p-4 rounded-lg">
          <p className="text-xs sm:text-sm text-gray-600 mb-1">Estimated Cost</p>
          <p data-testid="order-estimated-cost" className="text-xl sm:text-2xl font-bold text-indigo-600">₵{estimatedCost}</p>
        </div>

        <Button
          data-testid="order-submit-btn"
          type="submit"
          disabled={loading || (!orderForm.service_id && !orderForm.package_id)}
          className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Processing...' : 'Place Order'}
        </Button>
      </form>

      {(selectedService?.description || selectedPackage?.description) && (
        <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <p className="text-sm font-medium text-gray-900 mb-2">Description</p>
          <div className="text-sm text-gray-700 leading-relaxed">
            {formatDescription(selectedService?.description || selectedPackage?.description)}
          </div>
        </div>
      )}
    </div>
  );
});

DashboardOrderForm.displayName = 'DashboardOrderForm';

export default DashboardOrderForm;

