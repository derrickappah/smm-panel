import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const ServiceEditForm = ({ service, onSave, onCancel }) => {
  const [formData, setFormData] = useState({
    platform: service.platform,
    service_type: service.service_type,
    name: service.name,
    rate: service.rate,
    min_quantity: service.min_quantity,
    max_quantity: service.max_quantity,
    description: service.description || '',
    smmgen_service_id: service.smmgen_service_id || '',
    is_combo: service.is_combo || false,
    combo_service_ids: service.combo_service_ids || [],
    combo_smmgen_service_ids: service.combo_smmgen_service_ids || [],
    seller_only: service.seller_only || false,
    enabled: service.enabled === true // Explicitly check for true, default to false if null/undefined
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const updateData = {
      platform: formData.platform,
      service_type: formData.service_type,
      name: formData.name,
      rate: parseFloat(formData.rate),
      min_quantity: parseInt(formData.min_quantity),
      max_quantity: parseInt(formData.max_quantity),
      description: formData.description || null,
      smmgen_service_id: formData.smmgen_service_id || null,
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
      <div className="grid md:grid-cols-3 gap-4">
        <div>
          <Label>Rate (per 1000)</Label>
          <Input
            type="number"
            step="0.01"
            value={formData.rate}
            onChange={(e) => setFormData({ ...formData, rate: e.target.value })}
            required
          />
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
        <Input
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
        />
      </div>
      <div>
        <Label>SMMGen Service ID</Label>
        <Input
          placeholder="SMMGen API service ID (optional)"
          value={formData.smmgen_service_id}
          onChange={(e) => setFormData({ ...formData, smmgen_service_id: e.target.value })}
        />
        <p className="text-xs text-gray-500 mt-1">Enter the SMMGen API service ID for integration</p>
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
      <div className="flex gap-2">
        <Button type="submit" size="sm">Save</Button>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
};

export default ServiceEditForm;


