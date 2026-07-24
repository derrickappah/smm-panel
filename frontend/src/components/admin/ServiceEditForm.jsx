import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const normalizeComboServices = (comboServiceIds) => {
  if (!Array.isArray(comboServiceIds)) return [];
  return comboServiceIds.map(item => {
    if (typeof item === 'string') {
      return { id: item, combo_rate: null };
    }
    if (item && typeof item === 'object' && item.id) {
      return { id: item.id, combo_rate: item.combo_rate ?? null };
    }
    return null;
  }).filter(Boolean);
};

const ServiceEditForm = ({ service, onSave, onCancel, services = [] }) => {
  const [formData, setFormData] = useState({
    platform: service.platform,
    service_type: service.service_type,
    name: service.name,
    rate: service.rate,
    rate_unit: service.rate_unit || 1000,
    min_quantity: service.min_quantity,
    max_quantity: service.max_quantity,
    description: service.description || '',
    smmgen_service_id: service.smmgen_service_id || '',
    smmcost_service_id: service.smmcost_service_id || '',
    jbsmmpanel_service_id: service.jbsmmpanel_service_id || '',
    worldofsmm_service_id: service.worldofsmm_service_id || '',
    g1618_service_id: service.g1618_service_id || '',
    oldsmm_service_id: service.oldsmm_service_id || '',
    apiowner_service_id: service.apiowner_service_id || '',
    url_type: service.url_type || '',          // 'post' | 'profile' | '' (no validation)
    is_combo: service.is_combo || false,
    combo_service_ids: normalizeComboServices(service.combo_service_ids),
    combo_smmgen_service_ids: service.combo_smmgen_service_ids || [],
    seller_only: service.seller_only || false,
    enabled: service.enabled === true // Explicitly check for true, default to false if null/undefined
  });

  const handleSubmit = (e) => {
    e.preventDefault();

    // Validation: Minimum 2 services required for combo
    if (formData.is_combo && formData.combo_service_ids.length < 2) {
      alert('A combo service must include at least 2 component services.');
      return;
    }

    // Validation: Circular dependency check
    if (formData.is_combo && formData.combo_service_ids.length > 0) {
      const normalizedIds = normalizeComboServices(formData.combo_service_ids);
      for (const item of normalizedIds) {
        const selectedService = services.find(s => s.id === item.id);
        if (selectedService && selectedService.combo_service_ids) {
          const compServiceIds = normalizeComboServices(selectedService.combo_service_ids).map(x => x.id);
          if (compServiceIds.includes(service.id)) {
            alert(`Circular dependency detected: The selected service "${selectedService.name}" already includes this service in its combo. Please remove it to prevent circular references.`);
            return;
          }
        }
      }
    }

    const updateData = {
      platform: formData.platform,
      service_type: formData.service_type,
      name: formData.name,
      rate: parseFloat(formData.rate),
      rate_unit: parseInt(formData.rate_unit) || 1000,
      min_quantity: parseInt(formData.min_quantity),
      max_quantity: parseInt(formData.max_quantity),
      description: formData.description || null,
      smmgen_service_id: formData.smmgen_service_id || null,
      smmcost_service_id: formData.smmcost_service_id ? parseInt(formData.smmcost_service_id, 10) : null,
      jbsmmpanel_service_id: formData.jbsmmpanel_service_id ? parseInt(formData.jbsmmpanel_service_id, 10) : null,
      worldofsmm_service_id: formData.worldofsmm_service_id || null,
      g1618_service_id: formData.g1618_service_id || null,
      oldsmm_service_id: formData.oldsmm_service_id || null,
      apiowner_service_id: formData.apiowner_service_id || null,
      url_type: formData.url_type || null,    // null = skip URL type validation
      is_combo: Boolean(formData.is_combo),
      combo_service_ids: formData.is_combo && formData.combo_service_ids.length > 0
        ? formData.combo_service_ids
        : null,
      combo_smmgen_service_ids: formData.is_combo && formData.combo_smmgen_service_ids.length > 0
        ? formData.combo_smmgen_service_ids
        : null,
      seller_only: Boolean(formData.seller_only),
      enabled: Boolean(formData.enabled) // Explicitly convert to boolean
    };

    console.log('ServiceEditForm submitting:', updateData);
    onSave(updateData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
              <SelectItem value="telegram">Telegram</SelectItem>
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
      <div>
        <Label>Service Name</Label>
        <Input
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
        />
      </div>
      <div className="grid md:grid-cols-4 gap-4">
        <div>
          <Label>Rate</Label>
          <Input
            type="number"
            step="0.01"
            value={formData.rate}
            onChange={(e) => setFormData({ ...formData, rate: e.target.value })}
            required
          />
        </div>
        <div>
          <Label>Rate Unit</Label>
          <Input
            type="number"
            min="1"
            value={formData.rate_unit}
            onChange={(e) => setFormData({ ...formData, rate_unit: e.target.value })}
            required
          />
          <p className="text-xs text-gray-500 mt-1">Per quantity (e.g., 1000, 500, 100)</p>
        </div>
        <div>
          <Label>Min Quantity</Label>
          <Input
            type="number"
            value={formData.min_quantity}
            onChange={(e) => setFormData({ ...formData, min_quantity: e.target.value })}
            required
          />
        </div>
        <div>
          <Label>Max Quantity</Label>
          <Input
            type="number"
            value={formData.max_quantity}
            onChange={(e) => setFormData({ ...formData, max_quantity: e.target.value })}
            required
          />
        </div>
      </div>
      <div>
        <Label>Description</Label>
        <Textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          rows={4}
          className="resize-y"
        />
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <div>
          <Label>SMMGen Service ID</Label>
          <Input
            placeholder="SMMGen API service ID (optional)"
            value={formData.smmgen_service_id}
            onChange={(e) => setFormData({ ...formData, smmgen_service_id: e.target.value })}
          />
          <p className="text-xs text-gray-500 mt-1">Enter the SMMGen API service ID for integration</p>
        </div>
        <div>
          <Label>SMMCost Service ID</Label>
          <Input
            type="number"
            placeholder="SMMCost API service ID (optional)"
            value={formData.smmcost_service_id}
            onChange={(e) => setFormData({ ...formData, smmcost_service_id: e.target.value })}
          />
          <p className="text-xs text-gray-500 mt-1">Enter the SMMCost API service ID for integration</p>
        </div>
        <div>
          <Label>JB SMM Panel Service ID</Label>
          <Input
            type="number"
            placeholder="JB SMM Panel API service ID (optional)"
            value={formData.jbsmmpanel_service_id}
            onChange={(e) => setFormData({ ...formData, jbsmmpanel_service_id: e.target.value })}
          />
          <p className="text-xs text-gray-500 mt-1">Enter the JB SMM Panel API service ID for integration</p>
        </div>
        <div>
          <Label>World of SMM Service ID</Label>
          <Input
            placeholder="World of SMM API service ID (optional)"
            value={formData.worldofsmm_service_id}
            onChange={(e) => setFormData({ ...formData, worldofsmm_service_id: e.target.value })}
          />
          <p className="text-xs text-gray-500 mt-1">Enter the World of SMM API service ID for integration</p>
        </div>
        <div>
          <Label>G1618 Service ID</Label>
          <Input
            placeholder="G1618 API service ID (optional)"
            value={formData.g1618_service_id}
            onChange={(e) => setFormData({ ...formData, g1618_service_id: e.target.value })}
          />
          <p className="text-xs text-gray-500 mt-1">Enter the G1618 API service ID for integration</p>
        </div>
        <div>
          <Label>OldSMM Service ID</Label>
          <Input
            placeholder="OldSMM API service ID (optional)"
            value={formData.oldsmm_service_id}
            onChange={(e) => setFormData({ ...formData, oldsmm_service_id: e.target.value })}
          />
          <p className="text-xs text-gray-500 mt-1">Enter the OldSMM API service ID for integration</p>
        </div>
        <div>
          <Label>ApiOwner Service ID</Label>
          <Input
            placeholder="ApiOwner API service ID (optional)"
            value={formData.apiowner_service_id}
            onChange={(e) => setFormData({ ...formData, apiowner_service_id: e.target.value })}
          />
          <p className="text-xs text-gray-500 mt-1">Enter the ApiOwner API service ID for integration</p>
        </div>
      </div>

      {/* URL Type Validation */}
      <div className="p-4 border border-blue-200 rounded-lg bg-blue-50 space-y-2">
        <Label className="text-sm font-semibold text-blue-900">URL Type Validation</Label>
        <p className="text-xs text-blue-700">
          Set the link type customers must provide. The system will automatically validate the URL before placing the order.
        </p>
        <Select
          value={formData.url_type || 'none'}
          onValueChange={(value) => setFormData({ ...formData, url_type: value === 'none' ? '' : value })}
        >
          <SelectTrigger className="bg-white">
            <SelectValue placeholder="Select URL type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No Validation (accept any URL)</SelectItem>
            <SelectItem value="post">Post / Content URL — e.g. Likes, Views, Comments</SelectItem>
            <SelectItem value="profile">Profile / Page URL — e.g. Followers, Subscribers</SelectItem>
          </SelectContent>
        </Select>
        {formData.url_type === 'post' && (
          <p className="text-xs text-green-700 font-medium">
            ✓ Customers must enter a post/video/reel/content URL. Profile URLs will be rejected.
          </p>
        )}
        {formData.url_type === 'profile' && (
          <p className="text-xs text-green-700 font-medium">
            ✓ Customers must enter a profile/page/channel URL. Post URLs will be rejected.
          </p>
        )}
        {!formData.url_type && (
          <p className="text-xs text-gray-500">
            No URL type check. Any valid URL will be accepted.
          </p>
        )}
      </div>

      <div className="flex items-center space-x-2 p-3 border border-gray-200 rounded-lg bg-yellow-50">
        <input
          type="checkbox"
          id="edit_seller_only"
          checked={formData.seller_only}
          onChange={(e) => setFormData({ ...formData, seller_only: e.target.checked })}
          className="w-4 h-4 text-yellow-600 border-gray-300 rounded focus:ring-yellow-500"
        />
        <Label htmlFor="edit_seller_only" className="text-sm font-medium text-gray-900">
          Seller-only service
        </Label>
      </div>
      <div className="flex items-center space-x-2 p-3 border border-gray-200 rounded-lg bg-green-50">
        <input
          type="checkbox"
          id="edit_enabled"
          checked={Boolean(formData.enabled)}
          onChange={(e) => {
            const newEnabled = e.target.checked;
            console.log('Enabled checkbox changed:', newEnabled);
            setFormData({ ...formData, enabled: newEnabled });
          }}
          className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
        />
        <Label htmlFor="edit_enabled" className="text-sm font-medium text-gray-900">
          Enabled (visible to users)
        </Label>
      </div>

      {/* Combo Service Options */}
      <div className="space-y-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="edit_is_combo"
            checked={formData.is_combo}
            onChange={(e) => setFormData({ ...formData, is_combo: e.target.checked })}
            className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
          />
          <Label htmlFor="edit_is_combo" className="text-sm font-medium text-gray-900">
            This is a combo service (combines multiple services)
          </Label>
        </div>

        {formData.is_combo && (
          <div className="space-y-3 mt-3">
            <div>
              <Label className="text-sm font-medium">Component Services</Label>
              <p className="text-xs text-gray-500 mb-2">Select the services to include in this combo</p>
              <div className="max-h-60 overflow-y-auto border border-gray-200 rounded p-2 bg-white space-y-2">
                {services
                  .filter(s => !s.is_combo && s.id !== service.id)
                  .map((serviceItem) => {
                    const normalizedIds = normalizeComboServices(formData.combo_service_ids);
                    const isSelected = normalizedIds.some(item => item.id === serviceItem.id);
                    const componentItem = normalizedIds.find(item => item.id === serviceItem.id);
                    const customRate = componentItem ? componentItem.combo_rate : null;

                    return (
                      <div key={serviceItem.id} className="flex flex-col md:flex-row md:items-center justify-between py-2 border-b border-gray-100 last:border-0 gap-2">
                        <div className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              let updated;
                              if (e.target.checked) {
                                updated = [...normalizedIds, { id: serviceItem.id, combo_rate: serviceItem.rate }];
                              } else {
                                updated = normalizedIds.filter(item => item.id !== serviceItem.id);
                              }
                              setFormData({
                                ...formData,
                                combo_service_ids: updated
                              });
                            }}
                            className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                          />
                          <Label className="text-sm text-gray-700">
                            {serviceItem.name} ({serviceItem.platform} - ₵{serviceItem.rate}/{serviceItem.rate_unit || 1000})
                          </Label>
                        </div>
                        {isSelected && (
                          <div className="flex items-center space-x-2 pl-6 md:pl-0">
                            <span className="text-xs text-gray-500">Combo rate:</span>
                            <input
                              type="number"
                              step="0.01"
                              value={customRate !== null && customRate !== undefined ? customRate : ''}
                              placeholder={serviceItem.rate}
                              onChange={(e) => {
                                const val = e.target.value;
                                const updated = normalizedIds.map(item => 
                                  item.id === serviceItem.id 
                                    ? { ...item, combo_rate: val === '' ? null : parseFloat(val) } 
                                    : item
                                );
                                setFormData({
                                  ...formData,
                                  combo_service_ids: updated
                                });
                              }}
                              className="w-24 px-2 py-1 text-xs border border-gray-300 rounded focus:ring-indigo-500"
                            />
                            <span className="text-xs text-gray-500">GHS</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>

            {formData.is_combo && formData.combo_service_ids && formData.combo_service_ids.length > 0 && (
              <div className="flex items-center justify-between p-2 bg-indigo-50 rounded border border-indigo-100 text-xs">
                <span className="text-indigo-700 font-medium">
                  Sum of combo components: {
                    normalizeComboServices(formData.combo_service_ids).reduce((sum, item) => {
                      const val = item.combo_rate !== null && item.combo_rate !== undefined ? parseFloat(item.combo_rate) : 0;
                      return sum + (isNaN(val) ? 0 : val);
                    }, 0).toFixed(2)
                  } GHS
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const sum = normalizeComboServices(formData.combo_service_ids).reduce((sum, item) => {
                      const val = item.combo_rate !== null && item.combo_rate !== undefined ? parseFloat(item.combo_rate) : 0;
                      return sum + (isNaN(val) ? 0 : val);
                    }, 0);
                    setFormData({ ...formData, rate: sum.toFixed(2) });
                  }}
                  className="text-xs h-7 py-1 px-2 border-indigo-200 text-indigo-700 hover:bg-indigo-100"
                >
                  Apply to Total Rate
                </Button>
              </div>
            )}

            <div>
              <Label className="text-sm font-medium">SMMGen Service IDs (comma-separated)</Label>
              <Input
                placeholder="123, 456 (one for each component service)"
                value={formData.combo_smmgen_service_ids?.join(', ') || ''}
                onChange={(e) => {
                  const ids = e.target.value.split(',').map(id => id.trim()).filter(id => id);
                  setFormData({ ...formData, combo_smmgen_service_ids: ids });
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

      <div className="flex gap-2">
        <Button type="submit" size="sm">Save</Button>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
};

export default ServiceEditForm;


