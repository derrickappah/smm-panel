import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Plus, Edit, Trash2, Bell, X, AlertCircle, CheckCircle, ExternalLink, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useAdminServiceNotifications } from '@/hooks/useAdminServiceNotifications';
import { useAdminServices } from '@/hooks/useAdminServices';
import { useDebounce } from '@/hooks/useDebounce';

const AdminServiceNotifications = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [editingNotification, setEditingNotification] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const debouncedSearch = useDebounce(searchTerm, 300);

  const { notifications, isLoading, createNotification, updateNotification, deleteNotification } = useAdminServiceNotifications();
  const { data: services = [] } = useAdminServices();

  const [formData, setFormData] = useState({
    service_id: '',
    message: '',
    image_url: '',
    is_active: true
  });

  const filteredNotifications = notifications.filter(n => {
    const serviceName = n.service?.name?.toLowerCase() || '';
    const message = n.message?.toLowerCase() || '';
    const search = debouncedSearch.toLowerCase();
    return serviceName.includes(search) || message.includes(search);
  });

  const handleEdit = (notification) => {
    setEditingNotification(notification);
    setFormData({
      service_id: notification.service_id,
      message: notification.message,
      image_url: notification.image_url || '',
      is_active: notification.is_active
    });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this notification? This will also delete all acknowledgment records.')) {
      try {
        await deleteNotification(id);
      } catch (error) {
        // Error handled by mutation
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.service_id) {
      toast.error('Please select a service');
      return;
    }

    try {
      if (editingNotification) {
        await updateNotification({ id: editingNotification.id, updates: formData });
      } else {
        await createNotification(formData);
      }
      setShowForm(false);
      setEditingNotification(null);
      setFormData({ service_id: '', message: '', image_url: '', is_active: true });
    } catch (error) {
      // Error handled by mutation
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Bell className="w-6 h-6 text-indigo-600" />
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Service Targeted Notifications</h2>
        </div>
        <Button
          onClick={() => {
            setShowForm(true);
            setEditingNotification(null);
            setFormData({ service_id: '', message: '', image_url: '', is_active: true });
          }}
          className="bg-indigo-600 hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Notification
        </Button>
      </div>

      {showForm && (
        <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-900">
              {editingNotification ? 'Edit Notification' : 'Create New Targeted Notification'}
            </h3>
            <Button variant="ghost" size="sm" onClick={() => {
              setShowForm(false);
              setEditingNotification(null);
            }}>
              <X className="w-4 h-4" />
            </Button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Target Service</Label>
              <Select 
                value={formData.service_id} 
                onValueChange={(value) => setFormData({ ...formData, service_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a service to target" />
                </SelectTrigger>
                <SelectContent>
                  {services.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      [{s.platform.toUpperCase()}] {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 mt-1">This notification will ONLY appear for users who have ordered this specific service.</p>
            </div>
            <div>
              <Label>Popup Message</Label>
              <Textarea
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                className="min-h-[120px]"
                required
                placeholder="Enter the warning or instruction message..."
              />
            </div>
            <div>
              <Label>Image/Banner URL (Optional)</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    value={formData.image_url}
                    onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                    placeholder="https://example.com/banner.png"
                    className="pl-10"
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 p-2 bg-white rounded border border-gray-200 w-fit">
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                id="is_active"
              />
              <Label htmlFor="is_active" className="cursor-pointer font-medium">Enable Notification Popup</Label>
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="submit" className="flex-1 sm:flex-none">
                {editingNotification ? 'Update' : 'Create'} Notification
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)} className="flex-1 sm:flex-none">
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Search by service or message..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-200 border-t-indigo-600 mx-auto"></div>
          <p className="text-gray-500 mt-2">Loading notifications...</p>
        </div>
      ) : filteredNotifications.length === 0 ? (
        <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-300">
          <AlertCircle className="w-12 h-12 mx-auto mb-2 text-gray-400" />
          <p>No targeted notifications found</p>
          {debouncedSearch && <p className="text-sm">Try a different search term</p>}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredNotifications.map((n) => (
            <div key={n.id} className={`border rounded-lg p-4 transition-all hover:shadow-md ${n.is_active ? 'border-indigo-100 bg-indigo-50/20' : 'border-gray-200 bg-gray-50/50'}`}>
              <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <Badge variant={n.is_active ? 'default' : 'outline'} className={n.is_active ? 'bg-indigo-600' : ''}>
                      {n.is_active ? 'Active' : 'Disabled'}
                    </Badge>
                    <span className="text-sm font-bold text-gray-900">
                      Targeting: {n.service?.name}
                    </span>
                    <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">
                      {n.service?.platform}
                    </Badge>
                  </div>
                  
                  <p className="text-sm text-gray-700 mb-3 whitespace-pre-wrap italic">
                    "{n.message}"
                  </p>

                  <div className="flex items-center gap-4 text-xs font-medium">
                    <div className="flex items-center gap-1.5 text-green-600">
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>{n.acknowledgment_count} Acknowledgments</span>
                    </div>
                    <div className="text-gray-400">•</div>
                    <div className="text-gray-500">
                      Created {new Date(n.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-start">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(n)}
                    className="h-8 w-8 p-0"
                    title="Edit"
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(n.id)}
                    className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              
              {n.image_url && (
                <div className="mt-3 flex items-center gap-2 text-xs text-indigo-600 font-medium">
                  <ImageIcon className="w-3.5 h-3.5" />
                  <a href={n.image_url} target="_blank" rel="noopener noreferrer" className="hover:underline flex items-center gap-1">
                    Attached Image <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminServiceNotifications;
