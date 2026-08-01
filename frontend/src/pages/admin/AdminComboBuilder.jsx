import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Plus, Trash2, Edit2, Layers, CheckCircle2, AlertCircle, RefreshCw, Power, DollarSign, Clock, ListPlus } from 'lucide-react';
import { toast } from 'sonner';

const PROVIDER_OPTIONS = [
  { value: 'smmgen', label: 'SM Engine (SMMGen)' },
  { value: 'jbsmmpanel', label: 'SMM Course (JBSMMPanel)' },
  { value: 'apiowner', label: 'XYZ Panel (ApiOwner)' },
  { value: 'smmcost', label: 'SMMCost' },
  { value: 'worldofsmm', label: 'WorldOfSMM' },
  { value: 'g1618', label: 'G1618' },
  { value: 'oldsmm', label: 'OldSMM' }
];

const SERVICE_TYPES = [
  'Likes',
  'Views',
  'Shares',
  'Saves',
  'Comments',
  'Followers',
  'Subscribers',
  'Custom'
];

export default function AdminComboBuilder() {
  const [combos, setCombos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState(null);

  // Form State
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sellingPrice, setSellingPrice] = useState('20.00');
  const [category, setCategory] = useState('TikTok Boost');
  const [minOrder, setMinOrder] = useState('1');
  const [maxOrder, setMaxOrder] = useState('100000');
  const [status, setStatus] = useState('active');
  const [childServices, setChildServices] = useState([
    { provider: 'smmgen', provider_service_id: '3366', service_type: 'Likes', fixed_quantity: 1000, estimated_cost: 2.00, delay_seconds: 0, enabled: true },
    { provider: 'jbsmmpanel', provider_service_id: '5822', service_type: 'Views', fixed_quantity: 5000, estimated_cost: 5.00, delay_seconds: 10, enabled: true }
  ]);

  // Fetch Combo Services
  const fetchCombos = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('supabase.auth.token') || localStorage.getItem('sb-spihsvdchouynfbsotwq-auth-token');
      let jwtToken = '';
      if (token) {
        try {
          const parsed = JSON.parse(token);
          jwtToken = parsed.access_token || parsed?.currentSession?.access_token || '';
        } catch (e) {
          jwtToken = token;
        }
      }

      const res = await fetch('/api/admin/combo-services', {
        headers: {
          'Authorization': `Bearer ${jwtToken}`
        }
      });
      const data = await res.json();
      if (data.success) {
        setCombos(data.combos || []);
      } else {
        toast.error(data.error || 'Failed to fetch combo services');
      }
    } catch (err) {
      console.error('Error fetching combo services:', err);
      toast.error('Network error fetching combo services');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCombos();
  }, []);

  // Compute total provider cost & profit
  const totalProviderCost = useMemo(() => {
    return childServices.reduce((sum, item) => {
      if (item.enabled !== false) {
        return sum + (Number(item.estimated_cost) || 0);
      }
      return sum;
    }, 0);
  }, [childServices]);

  const computedProfit = useMemo(() => {
    const price = Number(sellingPrice) || 0;
    return Math.round((price - totalProviderCost + Number.EPSILON) * 100) / 100;
  }, [sellingPrice, totalProviderCost]);

  // Handle Child Service Changes
  const handleChildChange = (index, field, value) => {
    setChildServices(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleAddChild = () => {
    setChildServices(prev => [
      ...prev,
      { provider: 'smmgen', provider_service_id: '', service_type: 'Likes', fixed_quantity: 1000, estimated_cost: 1.00, delay_seconds: 0, enabled: true }
    ]);
  };

  const handleRemoveChild = (index) => {
    if (childServices.length <= 1) {
      toast.error('A combo service must have at least one child service');
      return;
    }
    setChildServices(prev => prev.filter((_, i) => i !== index));
  };

  // Reset Form
  const resetForm = () => {
    setEditingId(null);
    setName('');
    setDescription('');
    setSellingPrice('20.00');
    setCategory('TikTok Boost');
    setMinOrder('1');
    setMaxOrder('100000');
    setStatus('active');
    setChildServices([
      { provider: 'smmgen', provider_service_id: '3366', service_type: 'Likes', fixed_quantity: 1000, estimated_cost: 2.00, delay_seconds: 0, enabled: true },
      { provider: 'jbsmmpanel', provider_service_id: '5822', service_type: 'Views', fixed_quantity: 5000, estimated_cost: 5.00, delay_seconds: 10, enabled: true }
    ]);
  };

  // Edit Combo
  const handleEditCombo = (combo) => {
    setEditingId(combo.id);
    setName(combo.name || '');
    setDescription(combo.description || '');
    setSellingPrice(String(combo.selling_price || '0.00'));
    setCategory(combo.category || 'Combo');
    setMinOrder(String(combo.min_order || '1'));
    setMaxOrder(String(combo.max_order || '100000'));
    setStatus(combo.status || 'active');
    if (Array.isArray(combo.items) && combo.items.length > 0) {
      setChildServices(combo.items.map(item => ({
        provider: item.provider,
        provider_service_id: item.provider_service_id,
        service_type: item.service_type || 'Likes',
        fixed_quantity: item.fixed_quantity,
        estimated_cost: item.estimated_cost,
        delay_seconds: item.delay_seconds || 0,
        enabled: item.enabled !== false
      })));
    }
  };

  // Save Combo Service
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Please enter a Combo Service Name');
      return;
    }
    if (childServices.length === 0) {
      toast.error('Add at least one child service');
      return;
    }

    setSaving(true);
    try {
      const token = localStorage.getItem('supabase.auth.token') || localStorage.getItem('sb-spihsvdchouynfbsotwq-auth-token');
      let jwtToken = '';
      if (token) {
        try {
          const parsed = JSON.parse(token);
          jwtToken = parsed.access_token || parsed?.currentSession?.access_token || '';
        } catch (e) {
          jwtToken = token;
        }
      }

      const method = editingId ? 'PUT' : 'POST';
      const bodyPayload = {
        ...(editingId ? { id: editingId } : {}),
        name: name.trim(),
        description: description.trim(),
        selling_price: Number(sellingPrice),
        category: category.trim(),
        min_order: Number(minOrder),
        max_order: Number(maxOrder),
        status,
        child_services: childServices
      };

      const res = await fetch('/api/admin/combo-services', {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwtToken}`
        },
        body: JSON.stringify(bodyPayload)
      });

      const data = await res.json();
      if (data.success) {
        toast.success(editingId ? 'Combo service updated successfully!' : 'Combo service created successfully!');
        resetForm();
        fetchCombos();
      } else {
        toast.error(data.error || 'Failed to save combo service');
      }
    } catch (err) {
      console.error('Error saving combo service:', err);
      toast.error('Network error saving combo service');
    } finally {
      setSaving(false);
    }
  };

  // Delete Combo Service
  const handleDeleteCombo = async (id) => {
    if (!window.confirm('Are you sure you want to delete this combo service?')) return;
    try {
      const token = localStorage.getItem('supabase.auth.token') || localStorage.getItem('sb-spihsvdchouynfbsotwq-auth-token');
      let jwtToken = '';
      if (token) {
        try {
          const parsed = JSON.parse(token);
          jwtToken = parsed.access_token || parsed?.currentSession?.access_token || '';
        } catch (e) {
          jwtToken = token;
        }
      }

      const res = await fetch(`/api/admin/combo-services?id=${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${jwtToken}`
        }
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Combo service deleted');
        fetchCombos();
      } else {
        toast.error(data.error || 'Failed to delete');
      }
    } catch (err) {
      toast.error('Network error deleting combo service');
    }
  };

  const filteredCombos = useMemo(() => {
    if (!searchQuery.trim()) return combos;
    const q = searchQuery.toLowerCase();
    return combos.filter(c => 
      c.name.toLowerCase().includes(q) || 
      c.category.toLowerCase().includes(q) || 
      (c.description && c.description.toLowerCase().includes(q))
    );
  }, [combos, searchQuery]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-200 pb-5">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 flex items-center gap-3">
            <Layers className="w-8 h-8 text-indigo-600" />
            Combo Service Builder
          </h1>
          <p className="text-gray-600 mt-1">
            Bundle multiple child provider services behind a single customer-facing service.
          </p>
        </div>
        <Button onClick={fetchCombos} variant="outline" className="flex items-center gap-2">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh List
        </Button>
      </div>

      {/* Main Builder Form Card */}
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6 md:p-8 space-y-6">
        <div className="flex justify-between items-center border-b pb-4">
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            {editingId ? <Edit2 className="w-5 h-5 text-amber-500" /> : <ListPlus className="w-5 h-5 text-indigo-600" />}
            {editingId ? 'Edit Combo Service' : 'Create New Combo Service'}
          </h2>
          {editingId && (
            <Button variant="ghost" size="sm" onClick={resetForm} className="text-gray-500 hover:text-gray-700">
              Cancel Edit
            </Button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* General Metadata */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="space-y-2 lg:col-span-2">
              <Label className="font-semibold text-gray-700">Combo Service Name *</Label>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. TikTok Premium Boost Package"
                required
              />
            </div>

            <div className="space-y-2">
              <Label className="font-semibold text-gray-700">Category</Label>
              <Input
                value={category}
                onChange={e => setCategory(e.target.value)}
                placeholder="e.g. TikTok Boost"
              />
            </div>

            <div className="space-y-2">
              <Label className="font-semibold text-gray-700">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active (Visible)</SelectItem>
                  <SelectItem value="inactive">Inactive (Disabled)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 lg:col-span-4">
              <Label className="font-semibold text-gray-700">Description</Label>
              <Textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Detailed description of what this combo package delivers..."
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label className="font-semibold text-gray-700">Selling Price (GH₵) *</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={sellingPrice}
                onChange={e => setSellingPrice(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label className="font-semibold text-gray-700">Minimum Order</Label>
              <Input
                type="number"
                min="1"
                value={minOrder}
                onChange={e => setMinOrder(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label className="font-semibold text-gray-700">Maximum Order</Label>
              <Input
                type="number"
                min="1"
                value={maxOrder}
                onChange={e => setMaxOrder(e.target.value)}
              />
            </div>
          </div>

          {/* Pricing Calculator Summary */}
          <div className="bg-gradient-to-r from-indigo-50 via-purple-50 to-emerald-50 rounded-xl p-5 border border-indigo-100 grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
            <div className="p-3 bg-white/80 backdrop-blur rounded-lg border border-indigo-100">
              <span className="text-xs uppercase tracking-wider text-gray-500 font-bold block mb-1">Total Provider Cost</span>
              <span className="text-2xl font-extrabold text-gray-900">GH₵{totalProviderCost.toFixed(2)}</span>
            </div>
            <div className="p-3 bg-white/80 backdrop-blur rounded-lg border border-indigo-100">
              <span className="text-xs uppercase tracking-wider text-gray-500 font-bold block mb-1">Selling Price</span>
              <span className="text-2xl font-extrabold text-indigo-600">GH₵{Number(sellingPrice || 0).toFixed(2)}</span>
            </div>
            <div className="p-3 bg-white/80 backdrop-blur rounded-lg border border-indigo-100">
              <span className="text-xs uppercase tracking-wider text-gray-500 font-bold block mb-1">Estimated Profit</span>
              <span className={`text-2xl font-extrabold ${computedProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                GH₵{computedProfit.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Child Services Section */}
          <div className="space-y-4 pt-4 border-t border-gray-100">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-gray-800">Child Services Configuration</h3>
                <p className="text-xs text-gray-500">Attach unlimited child provider orders to execute behind the scenes.</p>
              </div>
              <Button type="button" onClick={handleAddChild} size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-2">
                <Plus className="w-4 h-4" />
                Add Child Service
              </Button>
            </div>

            <div className="space-y-3">
              {childServices.map((item, idx) => (
                <div 
                  key={idx} 
                  className={`p-4 rounded-xl border transition-all grid grid-cols-1 md:grid-cols-12 gap-3 items-center ${
                    item.enabled !== false ? 'bg-white border-gray-200 shadow-sm' : 'bg-gray-50 border-gray-200 opacity-60'
                  }`}
                >
                  <div className="md:col-span-3 space-y-1">
                    <Label className="text-xs font-semibold text-gray-600">Provider</Label>
                    <Select
                      value={item.provider}
                      onValueChange={val => handleChildChange(idx, 'provider', val)}
                    >
                      <SelectTrigger className="w-full h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PROVIDER_OPTIONS.map(p => (
                          <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="md:col-span-2 space-y-1">
                    <Label className="text-xs font-semibold text-gray-600">Service ID</Label>
                    <Input
                      className="h-9 text-xs"
                      value={item.provider_service_id}
                      onChange={e => handleChildChange(idx, 'provider_service_id', e.target.value)}
                      placeholder="e.g. 3366"
                      required
                    />
                  </div>

                  <div className="md:col-span-2 space-y-1">
                    <Label className="text-xs font-semibold text-gray-600">Service Type</Label>
                    <Select
                      value={item.service_type}
                      onValueChange={val => handleChildChange(idx, 'service_type', val)}
                    >
                      <SelectTrigger className="w-full h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SERVICE_TYPES.map(t => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="md:col-span-2 space-y-1">
                    <Label className="text-xs font-semibold text-gray-600">Fixed Quantity</Label>
                    <Input
                      type="number"
                      min="1"
                      className="h-9 text-xs"
                      value={item.fixed_quantity}
                      onChange={e => handleChildChange(idx, 'fixed_quantity', Number(e.target.value))}
                    />
                  </div>

                  <div className="md:col-span-1 space-y-1">
                    <Label className="text-xs font-semibold text-gray-600">Cost (GH₵)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      className="h-9 text-xs"
                      value={item.estimated_cost}
                      onChange={e => handleChildChange(idx, 'estimated_cost', Number(e.target.value))}
                    />
                  </div>

                  <div className="md:col-span-1 space-y-1">
                    <Label className="text-xs font-semibold text-gray-600">Delay (s)</Label>
                    <Input
                      type="number"
                      min="0"
                      className="h-9 text-xs"
                      value={item.delay_seconds}
                      onChange={e => handleChildChange(idx, 'delay_seconds', Number(e.target.value))}
                    />
                  </div>

                  <div className="md:col-span-1 flex items-center justify-end gap-2 pt-4 md:pt-0">
                    <button
                      type="button"
                      onClick={() => handleChildChange(idx, 'enabled', !item.enabled)}
                      className={`p-2 rounded-lg border transition-colors ${
                        item.enabled !== false ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-gray-100 text-gray-400 border-gray-300'
                      }`}
                      title={item.enabled !== false ? 'Enabled' : 'Disabled'}
                    >
                      <Power className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRemoveChild(idx)}
                      className="p-2 rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors"
                      title="Remove Child Service"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            {editingId && (
              <Button type="button" variant="outline" onClick={resetForm}>
                Cancel
              </Button>
            )}
            <Button type="submit" disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white min-w-[140px]">
              {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : null}
              {editingId ? 'Save Changes' : 'Create Combo Service'}
            </Button>
          </div>
        </form>
      </div>

      {/* Existing Combo Services List Table */}
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6 space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h2 className="text-xl font-bold text-gray-800">Existing Combo Services ({combos.length})</h2>
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search combo services..."
              className="pl-9"
            />
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-500 flex items-center justify-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-indigo-600" />
            Loading combo services...
          </div>
        ) : filteredCombos.length === 0 ? (
          <div className="text-center py-12 text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200">
            No combo services found. Create your first combo service above!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-700">
              <thead className="bg-gray-50 text-gray-500 font-semibold uppercase text-xs">
                <tr>
                  <th className="py-3 px-4">Combo Name</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Child Items</th>
                  <th className="py-3 px-4">Provider Cost</th>
                  <th className="py-3 px-4">Selling Price</th>
                  <th className="py-3 px-4">Profit</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredCombos.map(combo => (
                  <tr key={combo.id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="py-3 px-4 font-medium text-gray-900">{combo.name}</td>
                    <td className="py-3 px-4"><span className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium">{combo.category}</span></td>
                    <td className="py-3 px-4">
                      <span className="font-semibold text-gray-800">{Array.isArray(combo.items) ? combo.items.length : 0} items</span>
                    </td>
                    <td className="py-3 px-4 text-gray-600">GH₵{Number(combo.total_provider_cost || 0).toFixed(2)}</td>
                    <td className="py-3 px-4 font-bold text-gray-900">GH₵{Number(combo.selling_price || 0).toFixed(2)}</td>
                    <td className="py-3 px-4 font-bold text-emerald-600">GH₵{Number(combo.profit || 0).toFixed(2)}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                        combo.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        <span className={`w-2 h-2 rounded-full ${combo.status === 'active' ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></span>
                        {combo.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right space-x-2">
                      <Button size="sm" variant="ghost" onClick={() => handleEditCombo(combo)} className="text-indigo-600 hover:text-indigo-800">
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDeleteCombo(combo.id)} className="text-red-600 hover:text-red-800">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
