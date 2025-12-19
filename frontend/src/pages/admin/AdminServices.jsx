import React, { memo, useState, useMemo, useCallback } from 'react';
import { useAdminServices, useCreateService, useUpdateService, useDeleteService } from '@/hooks/useAdminServices';
import { useDebounce } from '@/hooks/useDebounce';
import ServiceEditForm from '@/components/admin/ServiceEditForm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, RefreshCw, Edit, Trash2, Power, PowerOff, Layers, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

const AdminServices = memo(() => {
  const queryClient = useQueryClient();
  const { data: services = [], isLoading, refetch } = useAdminServices();
  const createService = useCreateService();
  const updateService = useUpdateService();
  const deleteService = useDeleteService();

  const [serviceSearch, setServiceSearch] = useState('');
  const [editingService, setEditingService] = useState(null);
  const [serviceForm, setServiceForm] = useState({
    platform: '',
    service_type: '',
    name: '',
    rate: '',
    min_quantity: '',
    max_quantity: '',
    description: '',
    smmgen_service_id: '',
    is_combo: false,
    combo_service_ids: [],
    combo_smmgen_service_ids: [],
    seller_only: false,
    enabled: true
  });

  const debouncedSearch = useDebounce(serviceSearch, 300);

  const filteredServices = useMemo(() => {
    if (!debouncedSearch) return services;
    const searchLower = debouncedSearch.toLowerCase();
    return services.filter(s =>
      s.name?.toLowerCase().includes(searchLower) ||
      s.platform?.toLowerCase().includes(searchLower) ||
      s.service_type?.toLowerCase().includes(searchLower)
    );
  }, [services, debouncedSearch]);

  const handleCreateService = useCallback(async (e) => {
    e.preventDefault();
    try {
      await createService.mutateAsync({
        platform: serviceForm.platform,
        service_type: serviceForm.service_type,
        name: serviceForm.name,
        rate: parseFloat(serviceForm.rate),
        min_quantity: parseInt(serviceForm.min_quantity),
        max_quantity: parseInt(serviceForm.max_quantity),
        description: serviceForm.description,
        smmgen_service_id: serviceForm.smmgen_service_id || null,
        is_combo: serviceForm.is_combo || false,
        combo_service_ids: serviceForm.is_combo && serviceForm.combo_service_ids.length > 0 
          ? serviceForm.combo_service_ids 
          : null,
        combo_smmgen_service_ids: serviceForm.is_combo && serviceForm.combo_smmgen_service_ids.length > 0
          ? serviceForm.combo_smmgen_service_ids
          : null,
        seller_only: serviceForm.seller_only || false,
        enabled: Boolean(serviceForm.enabled !== false)
      });

      setServiceForm({
        platform: '',
        service_type: '',
        name: '',
        rate: '',
        min_quantity: '',
        max_quantity: '',
        description: '',
        smmgen_service_id: '',
        is_combo: false,
        combo_service_ids: [],
        combo_smmgen_service_ids: [],
        seller_only: false,
        enabled: true
      });
    } catch (error) {
      // Error handled by mutation
    }
  }, [serviceForm, createService]);

  const handleUpdateService = useCallback(async (serviceId, updates) => {
    try {
      await updateService.mutateAsync({ serviceId, updates });
      setEditingService(null);
    } catch (error) {
      // Error handled by mutation
    }
  }, [updateService]);

  const handleToggleService = useCallback(async (serviceId, currentEnabled) => {
    try {
      await updateService.mutateAsync({ 
        serviceId, 
        updates: { enabled: !currentEnabled } 
      });
    } catch (error) {
      // Error handled by mutation
    }
  }, [updateService]);

  const handleDeleteService = useCallback(async (serviceId) => {
    const service = services.find(s => s.id === serviceId);
    if (!service) return;

    // Check if there are any orders using this service
    const { data: ordersUsingService } = await queryClient.fetchQuery({
      queryKey: ['admin', 'orders'],
      queryFn: async () => {
        const { supabase } = await import('@/lib/supabase');
        const { data } = await supabase
          .from('orders')
          .select('id')
          .eq('service_id', serviceId);
        return data || [];
      }
    });

    const orderCount = ordersUsingService?.length || 0;
    if (orderCount > 0) {
      const confirmMessage = `Warning: This service has ${orderCount} order${orderCount === 1 ? '' : 's'} associated with it. Deleting this service will also delete all associated orders. Are you sure you want to continue?`;
      if (!confirm(confirmMessage)) {
        return;
      }
    } else {
      if (!confirm('Are you sure you want to delete this service? This action cannot be undone.')) {
        return;
      }
    }

    try {
      await deleteService.mutateAsync(serviceId);
    } catch (error) {
      // Error handled by mutation
    }
  }, [services, deleteService, queryClient]);

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        {/* Add Service Form Skeleton */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-8 shadow-sm">
          <div className="h-8 w-48 bg-gray-200 rounded animate-pulse mb-6"></div>
          <div className="space-y-5">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="h-10 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-10 bg-gray-200 rounded animate-pulse"></div>
            </div>
            <div className="h-10 bg-gray-200 rounded animate-pulse"></div>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="h-10 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-10 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-10 bg-gray-200 rounded animate-pulse"></div>
            </div>
            <div className="h-10 bg-gray-200 rounded animate-pulse"></div>
            <div className="h-10 bg-gray-200 rounded animate-pulse"></div>
            <div className="h-12 bg-gray-200 rounded animate-pulse"></div>
          </div>
        </div>

        {/* Services List Skeleton */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="flex items-center gap-4">
              <div className="h-8 w-32 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-9 w-24 bg-gray-200 rounded animate-pulse"></div>
            </div>
            <div className="flex-1 h-10 bg-gray-200 rounded animate-pulse"></div>
          </div>
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="p-4 rounded-xl bg-white/50 border-2 border-gray-200">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="h-6 w-64 bg-gray-200 rounded animate-pulse"></div>
                    <div className="h-4 w-48 bg-gray-200 rounded animate-pulse"></div>
                    <div className="h-4 w-56 bg-gray-200 rounded animate-pulse"></div>
                  </div>
                  <div className="flex gap-2">
                    <div className="h-9 w-9 bg-gray-200 rounded animate-pulse"></div>
                    <div className="h-9 w-9 bg-gray-200 rounded animate-pulse"></div>
                    <div className="h-9 w-9 bg-gray-200 rounded animate-pulse"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Add Service Form */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-8 shadow-sm">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6">Add New Service</h2>
        <form onSubmit={handleCreateService} className="space-y-5">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label>Platform</Label>
              <Select value={serviceForm.platform} onValueChange={(value) => setServiceForm({ ...serviceForm, platform: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select platform" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="instagram">Instagram</SelectItem>
                  <SelectItem value="tiktok">TikTok</SelectItem>
                  <SelectItem value="youtube">YouTube</SelectItem>
                  <SelectItem value="facebook">Facebook</SelectItem>
                  <SelectItem value="twitter">Twitter</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="telegram">Telegram</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Service Type</Label>
              <Input
                placeholder="e.g., followers, likes"
                value={serviceForm.service_type}
                onChange={(e) => setServiceForm({ ...serviceForm, service_type: e.target.value })}
                required
              />
            </div>
          </div>
          <div>
            <Label>Service Name</Label>
            <Input
              placeholder="e.g., Instagram Followers - High Quality"
              value={serviceForm.name}
              onChange={(e) => setServiceForm({ ...serviceForm, name: e.target.value })}
              required
            />
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <Label>Rate (per 1000)</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="5.00"
                value={serviceForm.rate}
                onChange={(e) => setServiceForm({ ...serviceForm, rate: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>Min Quantity</Label>
              <Input
                type="number"
                placeholder="100"
                value={serviceForm.min_quantity}
                onChange={(e) => setServiceForm({ ...serviceForm, min_quantity: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>Max Quantity</Label>
              <Input
                type="number"
                placeholder="10000"
                value={serviceForm.max_quantity}
                onChange={(e) => setServiceForm({ ...serviceForm, max_quantity: e.target.value })}
                required
              />
            </div>
          </div>
          <div>
            <Label>Description</Label>
            <Textarea
              placeholder="Service description"
              value={serviceForm.description}
              onChange={(e) => setServiceForm({ ...serviceForm, description: e.target.value })}
              rows={4}
              className="resize-y"
              required
            />
          </div>
          <div>
            <Label>SMMGen Service ID</Label>
            <Input
              placeholder="SMMGen API service ID (optional)"
              value={serviceForm.smmgen_service_id}
              onChange={(e) => setServiceForm({ ...serviceForm, smmgen_service_id: e.target.value })}
            />
            <p className="text-xs text-gray-500 mt-1">Enter the SMMGen API service ID for integration</p>
          </div>
          
          {/* Combo Service Options */}
          <div className="space-y-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="is_combo"
                checked={serviceForm.is_combo}
                onChange={(e) => setServiceForm({ ...serviceForm, is_combo: e.target.checked })}
                className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
              />
              <Label htmlFor="is_combo" className="text-sm font-medium text-gray-900">
                This is a combo service (combines multiple services)
              </Label>
            </div>
            
            {serviceForm.is_combo && (
              <div className="space-y-3 mt-3">
                <div>
                  <Label className="text-sm font-medium">Component Services</Label>
                  <p className="text-xs text-gray-500 mb-2">Select the services to include in this combo</p>
                  <div className="max-h-40 overflow-y-auto border border-gray-200 rounded p-2 bg-white">
                    {services.filter(s => !s.is_combo).map((service) => (
                      <div key={service.id} className="flex items-center space-x-2 py-1">
                        <input
                          type="checkbox"
                          checked={serviceForm.combo_service_ids?.includes(service.id)}
                          onChange={(e) => {
                            const currentIds = serviceForm.combo_service_ids || [];
                            if (e.target.checked) {
                              setServiceForm({
                                ...serviceForm,
                                combo_service_ids: [...currentIds, service.id]
                              });
                            } else {
                              setServiceForm({
                                ...serviceForm,
                                combo_service_ids: currentIds.filter(id => id !== service.id)
                              });
                            }
                          }}
                          className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                        />
                        <Label className="text-sm text-gray-700">
                          {service.name} ({service.platform})
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
                
                <div>
                  <Label className="text-sm font-medium">SMMGen Service IDs (comma-separated)</Label>
                  <Input
                    placeholder="123, 456 (one for each component service)"
                    value={serviceForm.combo_smmgen_service_ids?.join(', ') || ''}
                    onChange={(e) => {
                      const ids = e.target.value.split(',').map(id => id.trim()).filter(id => id);
                      setServiceForm({ ...serviceForm, combo_smmgen_service_ids: ids });
                    }}
                    className="mt-1"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Enter SMMGen service IDs in the same order as component services
                  </p>
                </div>
              </div>
            )}
          </div>
          
          {/* Seller-Only Service Option */}
          <div className="flex items-center space-x-2 p-4 border border-gray-200 rounded-lg bg-yellow-50">
            <input
              type="checkbox"
              id="seller_only"
              checked={serviceForm.seller_only}
              onChange={(e) => setServiceForm({ ...serviceForm, seller_only: e.target.checked })}
              className="w-4 h-4 text-yellow-600 border-gray-300 rounded focus:ring-yellow-500"
            />
            <Label htmlFor="seller_only" className="text-sm font-medium text-gray-900">
              Seller-only service (only visible to users with seller or admin role)
            </Label>
          </div>
          
          {/* Enabled Service Option */}
          <div className="flex items-center space-x-2 p-4 border border-gray-200 rounded-lg bg-green-50">
            <input
              type="checkbox"
              id="enabled"
              checked={Boolean(serviceForm.enabled !== false)}
              onChange={(e) => {
                const newEnabled = e.target.checked;
                setServiceForm({ ...serviceForm, enabled: newEnabled });
              }}
              className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
            />
            <Label htmlFor="enabled" className="text-sm font-medium text-gray-900">
              Enabled (service is visible to users)
            </Label>
          </div>
          
          <Button
            type="submit"
            disabled={createService.isPending}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white h-11 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            {createService.isPending ? 'Creating...' : 'Create Service'}
          </Button>
        </form>
      </div>

      {/* Services List */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex items-center gap-4">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">All Services</h2>
            <Button
              onClick={handleRefresh}
              disabled={isLoading}
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search services..."
              value={serviceSearch}
              onChange={(e) => setServiceSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
        <div className="space-y-4">
          {filteredServices.length === 0 ? (
            <p className="text-gray-600 text-center py-8">No services found</p>
          ) : (
            filteredServices.map((service) => (
              <div 
                key={service.id} 
                className={`p-4 rounded-xl transition-all ${
                  service.enabled === false 
                    ? 'bg-gray-100/50 border-2 border-gray-300 opacity-75' 
                    : 'bg-white/50 border-2 border-green-200'
                }`}
              >
                {editingService?.id === service.id ? (
                  <ServiceEditForm 
                    service={service} 
                    onSave={(updates) => handleUpdateService(service.id, updates)}
                    onCancel={() => setEditingService(null)}
                  />
                ) : (
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          {service.enabled !== false ? (
                            <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></div>
                          ) : (
                            <div className="w-3 h-3 rounded-full bg-red-500"></div>
                          )}
                          <p className={`font-medium ${service.enabled === false ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                            {service.name}
                          </p>
                        </div>
                        {service.enabled !== false ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full border border-green-300">
                            <CheckCircle className="w-3 h-3" />
                            Enabled
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded-full border border-red-300">
                            <PowerOff className="w-3 h-3" />
                            Disabled
                          </span>
                        )}
                        {service.is_combo && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium rounded-full">
                            <Layers className="w-3 h-3" />
                            Combo
                          </span>
                        )}
                        {service.seller_only && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs font-medium rounded-full">
                            Seller Only
                          </span>
                        )}
                      </div>
                      <p className={`text-sm ${service.enabled === false ? 'text-gray-400' : 'text-gray-600'}`}>
                        {service.platform} • {service.service_type}
                      </p>
                      <p className={`text-sm ${service.enabled === false ? 'text-gray-400' : 'text-gray-600'}`}>
                        Rate: ₵{service.rate}/1K • Qty: {service.min_quantity}-{service.max_quantity}
                      </p>
                      {service.is_combo && service.combo_service_ids && (
                        <p className="text-xs text-purple-600 mt-1">
                          Includes {service.combo_service_ids.length} service{service.combo_service_ids.length !== 1 ? 's' : ''}
                        </p>
                      )}
                      {service.smmgen_service_id && (
                        <p className="text-xs text-gray-500 mt-1">
                          SMMGen ID: {service.smmgen_service_id}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleToggleService(service.id, service.enabled === true)}
                        variant={service.enabled === true ? "outline" : "default"}
                        size="sm"
                        className={service.enabled === true ? "" : "bg-green-600 hover:bg-green-700 text-white"}
                        title={service.enabled === true ? "Disable service" : "Enable service"}
                        disabled={updateService.isPending}
                      >
                        {service.enabled === true ? (
                          <PowerOff className="w-4 h-4" />
                        ) : (
                          <Power className="w-4 h-4" />
                        )}
                      </Button>
                      <Button
                        onClick={() => setEditingService(service)}
                        variant="outline"
                        size="sm"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        onClick={() => handleDeleteService(service.id)}
                        variant="destructive"
                        size="sm"
                        disabled={deleteService.isPending}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
});

AdminServices.displayName = 'AdminServices';

export default AdminServices;

