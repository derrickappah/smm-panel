import React, { memo, useState, useMemo, useCallback } from 'react';
import { useAdminPromotionPackages, useCreatePromotionPackage, useUpdatePromotionPackage, useDeletePromotionPackage } from '@/hooks/useAdminPromotionPackages';
import { useDebounce } from '@/hooks/useDebounce';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, RefreshCw, Edit, Trash2, Power, PowerOff, Tag } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

const AdminPromotionPackages = memo(() => {
  const queryClient = useQueryClient();
  const { data: packages = [], isLoading, error, refetch } = useAdminPromotionPackages();
  const createPackage = useCreatePromotionPackage();
  const updatePackage = useUpdatePromotionPackage();
  const deletePackage = useDeletePromotionPackage();

  const [packageSearch, setPackageSearch] = useState('');
  const [editingPackage, setEditingPackage] = useState(null);
  const [packageForm, setPackageForm] = useState({
    name: '',
    platform: '',
    service_type: '',
    quantity: '',
    price: '',
    description: '',
    smmgen_service_id: '',
    enabled: true,
    display_order: '0',
    is_combo: false,
    combo_package_ids: [],
    combo_smmgen_service_ids: []
  });

  const debouncedSearch = useDebounce(packageSearch, 300);

  const filteredPackages = useMemo(() => {
    if (!debouncedSearch) return packages;
    const searchLower = debouncedSearch.toLowerCase();
    return packages.filter(p =>
      p.name?.toLowerCase().includes(searchLower) ||
      p.platform?.toLowerCase().includes(searchLower) ||
      p.service_type?.toLowerCase().includes(searchLower)
    );
  }, [packages, debouncedSearch]);

  const handleCreatePackage = useCallback(async (e) => {
    e.preventDefault();
    try {
      await createPackage.mutateAsync({
        name: packageForm.name,
        platform: packageForm.platform,
        service_type: packageForm.service_type,
        quantity: parseInt(packageForm.quantity),
        price: parseFloat(packageForm.price),
        description: packageForm.description || null,
        smmgen_service_id: packageForm.smmgen_service_id || null,
        enabled: Boolean(packageForm.enabled !== false),
        display_order: parseInt(packageForm.display_order) || 0,
        is_combo: packageForm.is_combo || false,
        combo_package_ids: packageForm.is_combo && packageForm.combo_package_ids.length > 0 
          ? packageForm.combo_package_ids 
          : null,
        combo_smmgen_service_ids: packageForm.is_combo && packageForm.combo_smmgen_service_ids.length > 0
          ? packageForm.combo_smmgen_service_ids
          : null
      });

      setPackageForm({
        name: '',
        platform: '',
        service_type: '',
        quantity: '',
        price: '',
        description: '',
        smmgen_service_id: '',
        enabled: true,
        display_order: '0',
        is_combo: false,
        combo_package_ids: [],
        combo_smmgen_service_ids: []
      });
    } catch (error) {
      // Error handled by mutation
    }
  }, [packageForm, createPackage]);

  const handleUpdatePackage = useCallback(async (packageId, updates) => {
    try {
      await updatePackage.mutateAsync({ packageId, updates });
      setEditingPackage(null);
    } catch (error) {
      // Error handled by mutation
    }
  }, [updatePackage]);

  const handleTogglePackage = useCallback(async (packageId, currentEnabled) => {
    try {
      await updatePackage.mutateAsync({ 
        packageId, 
        updates: { enabled: !currentEnabled } 
      });
    } catch (error) {
      // Error handled by mutation
    }
  }, [updatePackage]);

  const handleDeletePackage = useCallback(async (packageId) => {
    const pkg = packages.find(p => p.id === packageId);
    if (!pkg) return;

    // Check if there are any orders using this package
    const { data: ordersUsingPackage } = await queryClient.fetchQuery({
      queryKey: ['admin', 'orders'],
      queryFn: async () => {
        const { supabase } = await import('@/lib/supabase');
        const { data } = await supabase
          .from('orders')
          .select('id')
          .eq('promotion_package_id', packageId);
        return data || [];
      }
    });

    const orderCount = ordersUsingPackage?.length || 0;
    if (orderCount > 0) {
      const confirmMessage = `Warning: This package has ${orderCount} order${orderCount === 1 ? '' : 's'} associated with it. Deleting this package will remove the package reference from those orders. Are you sure you want to continue?`;
      if (!confirm(confirmMessage)) {
        return;
      }
    } else {
      if (!confirm('Are you sure you want to delete this promotion package? This action cannot be undone.')) {
        return;
      }
    }

    try {
      await deletePackage.mutateAsync(packageId);
    } catch (error) {
      // Error handled by mutation
    }
  }, [packages, deletePackage, queryClient]);

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const formatQuantity = (quantity) => {
    if (quantity >= 1000000) {
      return `${(quantity / 1000000).toFixed(1)}M`;
    } else if (quantity >= 1000) {
      return `${(quantity / 1000).toFixed(1)}K`;
    }
    return quantity.toString();
  };

  // Handle error state (e.g., table doesn't exist)
  if (error) {
    const isTableMissing = error?.message?.includes('relation') || 
                          error?.message?.includes('does not exist') ||
                          error?.code === '42P01';
    
    return (
      <div className="space-y-6">
        <div className="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-6">
          <h2 className="text-xl font-bold text-yellow-900 mb-2 flex items-center gap-2">
            <Tag className="w-6 h-6" />
            Database Setup Required
          </h2>
          {isTableMissing ? (
            <div className="space-y-3">
              <p className="text-yellow-800">
                The promotion_packages table has not been created yet. Please run the following migrations in your Supabase SQL Editor:
              </p>
              <ol className="list-decimal list-inside space-y-2 text-yellow-800 ml-4">
                <li>Run <code className="bg-yellow-100 px-2 py-1 rounded">CREATE_PROMOTION_PACKAGES.sql</code></li>
                <li>Run <code className="bg-yellow-100 px-2 py-1 rounded">ADD_RLS_PROMOTION_PACKAGES.sql</code></li>
                <li>Run <code className="bg-yellow-100 px-2 py-1 rounded">ADD_PROMOTION_PACKAGE_TO_ORDERS.sql</code></li>
              </ol>
              <p className="text-sm text-yellow-700 mt-4">
                These migration files are located in: <code className="bg-yellow-100 px-2 py-1 rounded">database/migrations/</code>
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-yellow-800 font-medium">Error loading promotion packages:</p>
              <p className="text-sm text-yellow-700">{error.message || 'Unknown error occurred'}</p>
              <Button
                onClick={() => refetch()}
                variant="outline"
                className="mt-4 border-yellow-300 text-yellow-800 hover:bg-yellow-100"
              >
                Retry
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
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
            <div className="h-12 bg-gray-200 rounded animate-pulse"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Add Package Form */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-8 shadow-sm">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
          <Tag className="w-6 h-6" />
          Add New Promotion Package
        </h2>
        <form onSubmit={handleCreatePackage} className="space-y-5">
          <div>
            <Label>Package Name</Label>
            <Input
              placeholder="e.g., 1M TikTok Views Package"
              value={packageForm.name}
              onChange={(e) => setPackageForm({ ...packageForm, name: e.target.value })}
              required
            />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label>Platform</Label>
              <Select value={packageForm.platform} onValueChange={(value) => setPackageForm({ ...packageForm, platform: value })}>
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
                placeholder="e.g., views, likes, followers"
                value={packageForm.service_type}
                onChange={(e) => setPackageForm({ ...packageForm, service_type: e.target.value })}
                required
              />
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <Label>Quantity (Fixed)</Label>
              <Input
                type="number"
                placeholder="1000000"
                value={packageForm.quantity}
                onChange={(e) => setPackageForm({ ...packageForm, quantity: e.target.value })}
                required
              />
              <p className="text-xs text-gray-500 mt-1">Fixed quantity for this package</p>
            </div>
            <div>
              <Label>Price (GHS)</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="200.00"
                value={packageForm.price}
                onChange={(e) => setPackageForm({ ...packageForm, price: e.target.value })}
                required
              />
              <p className="text-xs text-gray-500 mt-1">Fixed price in GHS</p>
            </div>
            <div>
              <Label>Display Order</Label>
              <Input
                type="number"
                placeholder="0"
                value={packageForm.display_order}
                onChange={(e) => setPackageForm({ ...packageForm, display_order: e.target.value })}
              />
              <p className="text-xs text-gray-500 mt-1">Lower numbers appear first</p>
            </div>
          </div>
          <div>
            <Label>Description</Label>
            <Input
              placeholder="Package description (optional)"
              value={packageForm.description}
              onChange={(e) => setPackageForm({ ...packageForm, description: e.target.value })}
            />
          </div>
          <div>
            <Label>SMMGen Service ID</Label>
            <Input
              placeholder="SMMGen API service ID (optional)"
              value={packageForm.smmgen_service_id}
              onChange={(e) => setPackageForm({ ...packageForm, smmgen_service_id: e.target.value })}
            />
            <p className="text-xs text-gray-500 mt-1">Enter the SMMGen API service ID for integration</p>
          </div>
          
          {/* Combo Package Options */}
          <div className="space-y-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="is_combo"
                checked={packageForm.is_combo}
                onChange={(e) => setPackageForm({ ...packageForm, is_combo: e.target.checked })}
                className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
              />
              <Label htmlFor="is_combo" className="text-sm font-medium text-gray-900">
                This is a combo package (combines multiple packages)
              </Label>
            </div>
            
            {packageForm.is_combo && (
              <div className="space-y-3 mt-3">
                <div>
                  <Label className="text-sm font-medium">Component Packages</Label>
                  <p className="text-xs text-gray-500 mb-2">Select the packages to include in this combo</p>
                  <div className="max-h-40 overflow-y-auto border border-gray-200 rounded p-2 bg-white">
                    {packages.filter(p => !p.is_combo).map((pkg) => (
                      <div key={pkg.id} className="flex items-center space-x-2 py-1">
                        <input
                          type="checkbox"
                          checked={packageForm.combo_package_ids?.includes(pkg.id)}
                          onChange={(e) => {
                            const currentIds = packageForm.combo_package_ids || [];
                            if (e.target.checked) {
                              setPackageForm({
                                ...packageForm,
                                combo_package_ids: [...currentIds, pkg.id]
                              });
                            } else {
                              setPackageForm({
                                ...packageForm,
                                combo_package_ids: currentIds.filter(id => id !== pkg.id)
                              });
                            }
                          }}
                          className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                        />
                        <Label className="text-sm text-gray-700">
                          {pkg.name} ({pkg.platform} - {pkg.price} GHS)
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
                
                <div>
                  <Label className="text-sm font-medium">SMMGen Service IDs (comma-separated)</Label>
                  <Input
                    placeholder="123, 456 (one for each component package)"
                    value={packageForm.combo_smmgen_service_ids?.join(', ') || ''}
                    onChange={(e) => {
                      const ids = e.target.value.split(',').map(id => id.trim()).filter(id => id);
                      setPackageForm({ ...packageForm, combo_smmgen_service_ids: ids });
                    }}
                    className="mt-1"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Enter SMMGen service IDs in the same order as component packages
                  </p>
                </div>
              </div>
            )}
          </div>
          
          {/* Enabled Package Option */}
          <div className="flex items-center space-x-2 p-4 border border-gray-200 rounded-lg bg-green-50">
            <input
              type="checkbox"
              id="enabled"
              checked={Boolean(packageForm.enabled !== false)}
              onChange={(e) => {
                const newEnabled = e.target.checked;
                setPackageForm({ ...packageForm, enabled: newEnabled });
              }}
              className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
            />
            <Label htmlFor="enabled" className="text-sm font-medium text-gray-900">
              Enabled (package is visible to users)
            </Label>
          </div>
          
          <Button
            type="submit"
            disabled={createPackage.isPending}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white h-11 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            {createPackage.isPending ? 'Creating...' : 'Create Promotion Package'}
          </Button>
        </form>
      </div>

      {/* Packages List */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex items-center gap-4">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">All Promotion Packages</h2>
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
              placeholder="Search packages..."
              value={packageSearch}
              onChange={(e) => setPackageSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
        <div className="space-y-4">
          {filteredPackages.length === 0 ? (
            <p className="text-gray-600 text-center py-8">No promotion packages found</p>
          ) : (
            filteredPackages.map((pkg) => (
              <div 
                key={pkg.id} 
                className={`p-4 rounded-xl transition-all ${
                  pkg.enabled === false 
                    ? 'bg-gray-100/50 border-2 border-gray-300 opacity-75' 
                    : 'bg-white/50 border-2 border-purple-200'
                }`}
              >
                {editingPackage?.id === pkg.id ? (
                  <PackageEditForm 
                    pkg={pkg} 
                    packages={packages}
                    onSave={(updates) => handleUpdatePackage(pkg.id, updates)}
                    onCancel={() => setEditingPackage(null)}
                  />
                ) : (
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">{pkg.name}</h3>
                        {pkg.is_combo && (
                          <span className="px-2 py-1 text-xs font-medium bg-indigo-100 text-indigo-700 rounded">
                            Combo
                          </span>
                        )}
                        {pkg.enabled === false && (
                          <span className="px-2 py-1 text-xs font-medium bg-gray-200 text-gray-700 rounded">
                            Disabled
                          </span>
                        )}
                      </div>
                      <div className="space-y-1 text-sm text-gray-600">
                        <p><span className="font-medium">Platform:</span> {pkg.platform}</p>
                        <p><span className="font-medium">Service Type:</span> {pkg.service_type}</p>
                        {pkg.is_combo && pkg.combo_package_ids && (
                          <p className="text-indigo-600 font-medium">
                            Includes {pkg.combo_package_ids.length} package{pkg.combo_package_ids.length !== 1 ? 's' : ''}
                          </p>
                        )}
                        <p><span className="font-medium">Quantity:</span> {formatQuantity(pkg.quantity)} ({pkg.quantity.toLocaleString()})</p>
                        <p><span className="font-medium">Price:</span> {pkg.price} GHS</p>
                        {pkg.description && <p><span className="font-medium">Description:</span> {pkg.description}</p>}
                        {pkg.smmgen_service_id && <p><span className="font-medium">SMMGen ID:</span> {pkg.smmgen_service_id}</p>}
                        <p><span className="font-medium">Display Order:</span> {pkg.display_order}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleTogglePackage(pkg.id, pkg.enabled === true)}
                        variant={pkg.enabled === true ? "outline" : "default"}
                        size="sm"
                        className={pkg.enabled === true ? "" : "bg-green-600 hover:bg-green-700 text-white"}
                        title={pkg.enabled === true ? "Disable package" : "Enable package"}
                        disabled={updatePackage.isPending}
                      >
                        {pkg.enabled === true ? (
                          <PowerOff className="w-4 h-4" />
                        ) : (
                          <Power className="w-4 h-4" />
                        )}
                      </Button>
                      <Button
                        onClick={() => setEditingPackage(pkg)}
                        variant="outline"
                        size="sm"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        onClick={() => handleDeletePackage(pkg.id)}
                        variant="destructive"
                        size="sm"
                        disabled={deletePackage.isPending}
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

// Package Edit Form Component
const PackageEditForm = ({ pkg, onSave, onCancel, packages = [] }) => {
  const [formData, setFormData] = useState({
    name: pkg.name,
    platform: pkg.platform,
    service_type: pkg.service_type,
    quantity: pkg.quantity,
    price: pkg.price,
    description: pkg.description || '',
    smmgen_service_id: pkg.smmgen_service_id || '',
    enabled: pkg.enabled === true,
    display_order: pkg.display_order || 0,
    is_combo: pkg.is_combo || false,
    combo_package_ids: pkg.combo_package_ids || [],
    combo_smmgen_service_ids: pkg.combo_smmgen_service_ids || []
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      name: formData.name,
      platform: formData.platform,
      service_type: formData.service_type,
      quantity: parseInt(formData.quantity),
      price: parseFloat(formData.price),
      description: formData.description || null,
      smmgen_service_id: formData.smmgen_service_id || null,
      enabled: Boolean(formData.enabled !== false),
      display_order: parseInt(formData.display_order) || 0,
      is_combo: formData.is_combo || false,
      combo_package_ids: formData.is_combo && formData.combo_package_ids.length > 0 
        ? formData.combo_package_ids 
        : null,
      combo_smmgen_service_ids: formData.is_combo && formData.combo_smmgen_service_ids.length > 0
        ? formData.combo_smmgen_service_ids
        : null
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label>Package Name</Label>
        <Input
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
        />
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <Label>Platform</Label>
          <Select value={formData.platform} onValueChange={(value) => setFormData({ ...formData, platform: value })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="instagram">Instagram</SelectItem>
              <SelectItem value="tiktok">TikTok</SelectItem>
              <SelectItem value="youtube">YouTube</SelectItem>
              <SelectItem value="facebook">Facebook</SelectItem>
              <SelectItem value="twitter">Twitter</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Service Type</Label>
          <Input
            value={formData.service_type}
            onChange={(e) => setFormData({ ...formData, service_type: e.target.value })}
            required
          />
        </div>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <div>
          <Label>Quantity</Label>
          <Input
            type="number"
            value={formData.quantity}
            onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
            required
          />
        </div>
        <div>
          <Label>Price (GHS)</Label>
          <Input
            type="number"
            step="0.01"
            value={formData.price}
            onChange={(e) => setFormData({ ...formData, price: e.target.value })}
            required
          />
        </div>
        <div>
          <Label>Display Order</Label>
          <Input
            type="number"
            value={formData.display_order}
            onChange={(e) => setFormData({ ...formData, display_order: e.target.value })}
          />
        </div>
      </div>
      <div>
        <Label>Description</Label>
        <Input
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
        />
      </div>
      <div>
        <Label>SMMGen Service ID</Label>
        <Input
          value={formData.smmgen_service_id}
          onChange={(e) => setFormData({ ...formData, smmgen_service_id: e.target.value })}
        />
      </div>
      
      {/* Combo Package Options */}
      <div className="space-y-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="is_combo-edit"
            checked={formData.is_combo}
            onChange={(e) => setFormData({ ...formData, is_combo: e.target.checked })}
            className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
          />
          <Label htmlFor="is_combo-edit" className="text-sm font-medium text-gray-900">
            This is a combo package (combines multiple packages)
          </Label>
        </div>
        
        {formData.is_combo && (
          <div className="space-y-3 mt-3">
            <div>
              <Label className="text-sm font-medium">Component Packages</Label>
              <p className="text-xs text-gray-500 mb-2">Select the packages to include in this combo</p>
              <div className="max-h-40 overflow-y-auto border border-gray-200 rounded p-2 bg-white">
                {packages.filter(p => !p.is_combo && p.id !== pkg.id).map((pkgItem) => (
                  <div key={pkgItem.id} className="flex items-center space-x-2 py-1">
                    <input
                      type="checkbox"
                      checked={formData.combo_package_ids?.includes(pkgItem.id)}
                      onChange={(e) => {
                        const currentIds = formData.combo_package_ids || [];
                        if (e.target.checked) {
                          setFormData({
                            ...formData,
                            combo_package_ids: [...currentIds, pkgItem.id]
                          });
                        } else {
                          setFormData({
                            ...formData,
                            combo_package_ids: currentIds.filter(id => id !== pkgItem.id)
                          });
                        }
                      }}
                      className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                    />
                    <Label className="text-sm text-gray-700">
                      {pkgItem.name} ({pkgItem.platform} - {pkgItem.price} GHS)
                    </Label>
                  </div>
                ))}
              </div>
            </div>
            
            <div>
              <Label className="text-sm font-medium">SMMGen Service IDs (comma-separated)</Label>
              <Input
                placeholder="123, 456 (one for each component package)"
                value={formData.combo_smmgen_service_ids?.join(', ') || ''}
                onChange={(e) => {
                  const ids = e.target.value.split(',').map(id => id.trim()).filter(id => id);
                  setFormData({ ...formData, combo_smmgen_service_ids: ids });
                }}
                className="mt-1"
              />
              <p className="text-xs text-gray-500 mt-1">
                Enter SMMGen service IDs in the same order as component packages
              </p>
            </div>
          </div>
        )}
      </div>
      
      <div className="flex items-center space-x-2">
        <input
          type="checkbox"
          id="enabled-edit"
          checked={formData.enabled}
          onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
          className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
        />
        <Label htmlFor="enabled-edit">Enabled</Label>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm">Save</Button>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
};

AdminPromotionPackages.displayName = 'AdminPromotionPackages';

export default AdminPromotionPackages;

