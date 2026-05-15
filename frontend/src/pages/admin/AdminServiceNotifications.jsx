import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Plus, Edit, Trash2, Bell, X, AlertCircle, CheckCircle, ExternalLink, Image as ImageIcon, Video, List, Info } from 'lucide-react';
import { toast } from 'sonner';
import { useAdminServiceNotifications } from '@/hooks/useAdminServiceNotifications';
import { useAdminServices } from '@/hooks/useAdminServices';
import { useDebounce } from '@/hooks/useDebounce';
import { cn } from '@/lib/utils';

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
    title: 'Important Notification',
    subtitle: 'Just now',
    show_order_id: true,
    instructions_title: 'What you need to do:',
    instructions_steps: [''],
    show_instructions: true,
    video_url: '',
    show_video: false,
    image_url: '',
    is_active: true
  });

  const filteredNotifications = notifications.filter(n => {
    const serviceName = n.service?.name?.toLowerCase() || '';
    const message = n.message?.toLowerCase() || '';
    const title = n.title?.toLowerCase() || '';
    const search = debouncedSearch.toLowerCase();
    return serviceName.includes(search) || message.includes(search) || title.includes(search);
  });

  const handleEdit = (notification) => {
    setEditingNotification(notification);
    setFormData({
      service_id: notification.service_id,
      message: notification.message,
      title: notification.title || 'Important Notification',
      subtitle: notification.subtitle || 'Just now',
      show_order_id: notification.show_order_id ?? true,
      instructions_title: notification.instructions_title || 'What you need to do:',
      instructions_steps: Array.isArray(notification.instructions_steps) && notification.instructions_steps.length > 0 
        ? notification.instructions_steps 
        : [''],
      show_instructions: notification.show_instructions ?? true,
      video_url: notification.video_url || '',
      show_video: notification.show_video ?? false,
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

  const handleStepChange = (index, value) => {
    const newSteps = [...formData.instructions_steps];
    newSteps[index] = value;
    setFormData({ ...formData, instructions_steps: newSteps });
  };

  const addStep = () => {
    setFormData({ ...formData, instructions_steps: [...formData.instructions_steps, ''] });
  };

  const removeStep = (index) => {
    const newSteps = formData.instructions_steps.filter((_, i) => i !== index);
    setFormData({ ...formData, instructions_steps: newSteps.length > 0 ? newSteps : [''] });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.service_id) {
      toast.error('Please select a service');
      return;
    }

    // Clean up empty steps
    const cleanedSteps = formData.instructions_steps.filter(s => s.trim() !== '');
    const dataToSubmit = { ...formData, instructions_steps: cleanedSteps };

    try {
      if (editingNotification) {
        await updateNotification({ id: editingNotification.id, updates: dataToSubmit });
      } else {
        await createNotification(dataToSubmit);
      }
      setShowForm(false);
      setEditingNotification(null);
      resetForm();
    } catch (error) {
      // Error handled by mutation
    }
  };

  const resetForm = () => {
    setFormData({
      service_id: '',
      message: '',
      title: 'Important Notification',
      subtitle: 'Just now',
      show_order_id: true,
      instructions_title: 'What you need to do:',
      instructions_steps: [''],
      show_instructions: true,
      video_url: '',
      show_video: false,
      image_url: '',
      is_active: true
    });
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-50 rounded-2xl">
            <Bell className="w-6 h-6 text-indigo-600" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Premium Notifications</h2>
        </div>
        <Button
          onClick={() => {
            setShowForm(true);
            setEditingNotification(null);
            resetForm();
          }}
          className="bg-indigo-600 hover:bg-indigo-700 rounded-xl h-11 px-6 font-bold shadow-lg shadow-indigo-100"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Notification
        </Button>
      </div>

      {showForm && (
        <div className="mb-8 p-6 bg-gray-50 border border-gray-200 rounded-[2rem] animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                <Edit className="w-4 h-4 text-indigo-600" />
              </div>
              <h3 className="font-bold text-gray-900">
                {editingNotification ? 'Edit Notification' : 'Create New Targeted Notification'}
              </h3>
            </div>
            <Button variant="ghost" size="sm" onClick={() => {
              setShowForm(false);
              setEditingNotification(null);
            }} className="rounded-full">
              <X className="w-4 h-4" />
            </Button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="p-5 bg-white rounded-3xl border border-gray-100 shadow-sm space-y-4">
                  <div className="flex items-center gap-2 text-indigo-600 font-bold text-[10px] uppercase tracking-[0.2em]">
                    <Info className="w-3.5 h-3.5" />
                    Targeting & Basic Info
                  </div>
                  
                  <div>
                    <Label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Target Service</Label>
                    <Select 
                      value={formData.service_id} 
                      onValueChange={(value) => setFormData({ ...formData, service_id: value })}
                    >
                      <SelectTrigger className="rounded-xl mt-1 h-12 border-gray-100">
                        <SelectValue placeholder="Select a service to target" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        {services.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            [{s.platform.toUpperCase()}] {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Main Message</Label>
                    <Textarea
                      value={formData.message}
                      onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                      className="min-h-[100px] rounded-xl mt-1 border-gray-100 focus:border-indigo-300 resize-none"
                      required
                      placeholder="e.g. Please, your **likes** are **dropping**."
                    />
                    <p className="text-[10px] text-gray-400 mt-1 ml-1">Use **text** to highlight in purple.</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Popup Title</Label>
                      <Input
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        className="rounded-xl mt-1 h-11 border-gray-100"
                        placeholder="Important Notification"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Subtitle</Label>
                      <Input
                        value={formData.subtitle}
                        onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
                        className="rounded-xl mt-1 h-11 border-gray-100"
                        placeholder="Just now"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-gray-50/50 rounded-2xl border border-gray-100">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-bold text-gray-900">Show Order ID</Label>
                      <p className="text-[11px] text-gray-500 font-medium">Display provider order ID in popup</p>
                    </div>
                    <Switch
                      checked={formData.show_order_id}
                      onCheckedChange={(checked) => setFormData({ ...formData, show_order_id: checked })}
                    />
                  </div>
                </div>

                <div className="p-5 bg-white rounded-3xl border border-gray-100 shadow-sm space-y-4">
                  <div className="flex items-center gap-2 text-indigo-600 font-bold text-[10px] uppercase tracking-[0.2em]">
                    <Video className="w-3.5 h-3.5" />
                    Media & Status
                  </div>
                  
                  <div className="flex items-center justify-between mb-2">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-bold text-gray-900">Video Tutorial</Label>
                      <p className="text-[11px] text-gray-500 font-medium">Link a help video for the user</p>
                    </div>
                    <Switch
                      checked={formData.show_video}
                      onCheckedChange={(checked) => setFormData({ ...formData, show_video: checked })}
                    />
                  </div>
                  
                  {formData.show_video && (
                    <div className="relative">
                      <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                      <Input
                        value={formData.video_url}
                        onChange={(e) => setFormData({ ...formData, video_url: e.target.value })}
                        placeholder="https://youtube.com/watch?v=..."
                        className="rounded-xl pl-10 h-11 border-gray-100"
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-between p-4 bg-indigo-600 rounded-2xl shadow-xl shadow-indigo-100 mt-2">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-bold text-white">Notification Status</Label>
                      <p className="text-[11px] text-white/70 font-medium italic">Make this live for customers</p>
                    </div>
                    <Switch
                      checked={formData.is_active}
                      onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                      className="data-[state=checked]:bg-white data-[state=unchecked]:bg-indigo-300 [&>span]:data-[state=checked]:bg-indigo-600"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="p-5 bg-white rounded-3xl border border-gray-100 shadow-sm space-y-5 h-full">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-indigo-600 font-bold text-[10px] uppercase tracking-[0.2em]">
                      <List className="w-3.5 h-3.5" />
                      Instructions Section
                    </div>
                    <Switch
                      checked={formData.show_instructions}
                      onCheckedChange={(checked) => setFormData({ ...formData, show_instructions: checked })}
                    />
                  </div>

                  {formData.show_instructions && (
                    <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-500">
                      <div>
                        <Label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Section Title</Label>
                        <Input
                          value={formData.instructions_title}
                          onChange={(e) => setFormData({ ...formData, instructions_title: e.target.value })}
                          className="rounded-xl mt-1 h-11 border-gray-100"
                          placeholder="What you need to do:"
                        />
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between mb-1">
                          <Label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Instruction Steps</Label>
                          <span className="text-[10px] font-bold text-indigo-400">{formData.instructions_steps.length} Steps</span>
                        </div>
                        <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1 custom-scrollbar">
                          {formData.instructions_steps.map((step, index) => (
                            <div key={index} className="flex gap-2 group">
                              <div className="bg-gray-50 border border-gray-100 rounded-xl w-10 h-10 flex items-center justify-center font-black text-gray-400 text-xs flex-shrink-0">
                                {index + 1}
                              </div>
                              <Input
                                value={step}
                                onChange={(e) => handleStepChange(index, e.target.value)}
                                placeholder={`Step ${index + 1}... Use [text] for highlights.`}
                                className="rounded-xl border-gray-100 h-10 focus:border-indigo-200"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeStep(index)}
                                className="rounded-xl h-10 w-10 p-0 text-red-400 hover:text-red-600 hover:bg-red-50 flex-shrink-0"
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={addStep}
                          className="w-full rounded-xl h-11 border-dashed text-indigo-600 border-indigo-200 hover:bg-indigo-50 font-bold"
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Add New Step
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button type="submit" className="flex-1 rounded-2xl h-14 bg-indigo-600 hover:bg-indigo-700 shadow-xl shadow-indigo-100 text-base font-black uppercase tracking-wider">
                {editingNotification ? 'Save Changes' : 'Publish Notification'}
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)} className="rounded-2xl h-14 px-10 font-bold text-gray-500">
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-300 w-5 h-5" />
          <Input
            placeholder="Search by service or title..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-12 rounded-2xl h-14 border-gray-100 focus:border-indigo-300 transition-all shadow-sm text-base"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-20">
          <div className="relative w-16 h-16 mx-auto mb-4">
            <div className="absolute inset-0 rounded-full border-4 border-indigo-50 border-t-indigo-600 animate-spin"></div>
            <div className="absolute inset-2 rounded-full border-4 border-indigo-100 border-b-indigo-400 animate-spin-slow"></div>
          </div>
          <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">Loading Secure Data</p>
        </div>
      ) : filteredNotifications.length === 0 ? (
        <div className="text-center py-24 text-gray-500 bg-gray-50/50 rounded-[3rem] border border-dashed border-gray-200">
          <div className="bg-white w-20 h-20 rounded-[2rem] flex items-center justify-center mx-auto mb-6 shadow-xl shadow-gray-200/20 border border-gray-100">
            <Bell className="w-10 h-10 text-gray-200" />
          </div>
          <h4 className="text-xl font-black text-gray-900 uppercase tracking-tight">No Notifications Found</h4>
          <p className="text-sm text-gray-400 mt-2 font-medium max-w-xs mx-auto">Your list is currently empty. Click "New Notification" to get started.</p>
          {debouncedSearch && (
            <Button variant="link" onClick={() => setSearchTerm('')} className="text-indigo-600 mt-4 font-black uppercase text-xs tracking-widest">
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5">
          {filteredNotifications.map((n) => (
            <div key={n.id} className={cn(
              "group relative border rounded-[2rem] p-6 transition-all duration-500 hover:shadow-2xl hover:shadow-indigo-500/10",
              n.is_active ? 'border-indigo-50 bg-white' : 'border-gray-200 bg-gray-50/30 grayscale'
            )}>
              <div className="flex flex-col md:flex-row items-start justify-between gap-6">
                <div className="flex-1 space-y-5">
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className={cn(
                      "w-14 h-14 rounded-3xl flex items-center justify-center shadow-inner transition-all group-hover:scale-110",
                      n.is_active ? "bg-indigo-50 text-indigo-600" : "bg-gray-100 text-gray-400"
                    )}>
                      <Bell className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-sm font-black text-gray-900 uppercase tracking-tight">
                          {n.service?.name}
                        </span>
                        <Badge variant="outline" className="text-[10px] font-black px-2 py-0 border-gray-100 text-gray-400 uppercase">
                          {n.service?.platform}
                        </Badge>
                        {n.is_active ? (
                          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-green-50 text-green-600 rounded-full text-[10px] font-black border border-green-100">
                            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                            LIVE
                          </div>
                        ) : (
                          <div className="px-2 py-0.5 bg-gray-100 text-gray-400 rounded-full text-[10px] font-black border border-gray-200">
                            INACTIVE
                          </div>
                        )}
                      </div>
                      <h4 className="text-lg font-black text-gray-900 tracking-tight leading-tight">{n.title}</h4>
                      <p className="text-[11px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">{n.subtitle}</p>
                    </div>
                  </div>
                  
                  <div className="bg-gray-50/50 rounded-2xl p-5 border border-gray-100/50 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500/20" />
                    <p className="text-sm text-gray-700 leading-relaxed font-medium italic">
                      "{n.message}"
                    </p>
                  </div>

                  <div className="flex items-center gap-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                    <div className="flex items-center gap-2 text-indigo-600">
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>{n.acknowledgment_count} ACKNOWLEDGMENTS</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <List className="w-3.5 h-3.5" />
                      <span>{Array.isArray(n.instructions_steps) ? n.instructions_steps.length : 0} STEPS</span>
                    </div>
                    {n.show_video && n.video_url && (
                      <div className="flex items-center gap-2 text-red-400">
                        <Video className="w-3.5 h-3.5" />
                        <span>VIDEO ATTACHED</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex md:flex-col items-center gap-3 self-end md:self-start">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleEdit(n)}
                    className="h-12 w-12 rounded-2xl border-gray-100 hover:border-indigo-200 hover:bg-indigo-50 text-indigo-600 transition-all shadow-sm group-hover:bg-indigo-600 group-hover:text-white group-hover:border-indigo-600"
                    title="Edit"
                  >
                    <Edit className="w-5 h-5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleDelete(n.id)}
                    className="h-12 w-12 rounded-2xl text-red-400 hover:text-white hover:bg-red-500 border-gray-100 hover:border-red-500 transition-all shadow-sm"
                    title="Delete"
                  >
                    <Trash2 className="w-5 h-5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminServiceNotifications;
