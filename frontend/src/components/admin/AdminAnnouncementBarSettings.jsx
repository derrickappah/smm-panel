import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Megaphone, Save, RotateCcw, Eye, Sparkles, Loader2 } from 'lucide-react';
import { useAnnouncement, useUpdateAnnouncement, DEFAULT_ANNOUNCEMENT } from '@/hooks/useAnnouncement';

const THEME_STYLES = {
  navy: 'bg-[#061727] text-white border-y border-[#0d2a45]',
  emerald: 'bg-[#062c1e] text-emerald-100 border-y border-[#0a4630]',
  amber: 'bg-[#2a1705] text-amber-200 border-y border-[#48280a]',
  crimson: 'bg-[#2a0808] text-rose-100 border-y border-[#481212]',
};

const SPEED_SETTINGS = {
  slow: 35,
  normal: 22,
  fast: 14,
};

const AdminAnnouncementBarSettings = () => {
  const { data: announcement = DEFAULT_ANNOUNCEMENT, isLoading } = useAnnouncement();
  const updateAnnouncement = useUpdateAnnouncement();

  const [formData, setFormData] = useState({
    id: announcement?.id || 'default',
    message: announcement?.message || DEFAULT_ANNOUNCEMENT.message,
    enabled: announcement?.enabled ?? true,
    speed: announcement?.speed || 'normal',
    theme: announcement?.theme || 'navy',
    display_scope: announcement?.display_scope || 'all',
  });

  // Sync state when data is loaded/updated
  useEffect(() => {
    if (announcement) {
      setFormData({
        id: announcement.id,
        message: announcement.message || DEFAULT_ANNOUNCEMENT.message,
        enabled: announcement.enabled !== false,
        speed: announcement.speed || 'normal',
        theme: announcement.theme || 'navy',
        display_scope: announcement.display_scope || 'all',
      });
    }
  }, [announcement]);

  const handleResetDefault = () => {
    setFormData((prev) => ({
      ...prev,
      message: DEFAULT_ANNOUNCEMENT.message,
      speed: 'normal',
      theme: 'navy',
      display_scope: 'all',
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    updateAnnouncement.mutate(formData);
  };

  const previewItems = [
    formData.message || 'YOUR ANNOUNCEMENT MESSAGE HERE',
    formData.message || 'YOUR ANNOUNCEMENT MESSAGE HERE',
    formData.message || 'YOUR ANNOUNCEMENT MESSAGE HERE',
  ];

  const currentThemeClass = THEME_STYLES[formData.theme] || THEME_STYLES.navy;
  const currentDuration = SPEED_SETTINGS[formData.speed] || SPEED_SETTINGS.normal;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 sm:p-7 shadow-sm mb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-lg">
            <Megaphone className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 flex items-center gap-2">
              Top Announcement / Status Bar
              <Badge variant={formData.enabled ? "default" : "secondary"} className={formData.enabled ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}>
                {formData.enabled ? 'Live on Site' : 'Disabled'}
              </Badge>
            </h2>
            <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
              Control the scrolling ticker banner displayed directly under the top navigation bar.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 bg-gray-50 px-4 py-2 rounded-lg border border-gray-200 self-start sm:self-auto">
          <Label htmlFor="announcement-toggle" className="text-sm font-medium text-gray-700 cursor-pointer">
            {formData.enabled ? 'Status: Active' : 'Status: Off'}
          </Label>
          <Switch
            id="announcement-toggle"
            checked={formData.enabled}
            onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, enabled: checked }))}
          />
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 pt-5">
        {/* Message Input */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <Label htmlFor="announcement-message" className="text-sm font-semibold text-gray-800">
              Announcement / Status Message
            </Label>
            <button
              type="button"
              onClick={handleResetDefault}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              Reset to Default
            </button>
          </div>
          <Textarea
            id="announcement-message"
            rows={3}
            value={formData.message}
            onChange={(e) => setFormData((prev) => ({ ...prev, message: e.target.value }))}
            placeholder="E.g. ⚡ ORDERS PROCESSING SPEED: FAST & ACTIVE !! 🚀 24/7 AUTOMATED DELIVERY ACROSS ALL SERVICES"
            className="font-medium text-sm text-gray-900 border-gray-300 focus:ring-indigo-500 focus:border-indigo-500"
            required
          />
          <p className="text-xs text-gray-500 mt-1">
            Tip: You can use emojis (⚡, 🚀, 🔥), uppercase letters, and exclamation marks to make urgent alerts stand out.
          </p>
        </div>

        {/* Configuration Row: Theme, Speed, Display Scope */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
          {/* Theme / Color preset */}
          <div>
            <Label className="text-sm font-semibold text-gray-800 mb-1.5 block">
              Color Theme
            </Label>
            <Select
              value={formData.theme}
              onValueChange={(val) => setFormData((prev) => ({ ...prev, theme: val }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select theme" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="navy">
                  <div className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 rounded-full bg-[#061727] border border-gray-400"></span>
                    <span>Deep Navy (Default)</span>
                  </div>
                </SelectItem>
                <SelectItem value="emerald">
                  <div className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 rounded-full bg-emerald-800"></span>
                    <span>Emerald Green (Active)</span>
                  </div>
                </SelectItem>
                <SelectItem value="amber">
                  <div className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 rounded-full bg-amber-600"></span>
                    <span>Amber (Notice)</span>
                  </div>
                </SelectItem>
                <SelectItem value="crimson">
                  <div className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 rounded-full bg-rose-700"></span>
                    <span>Crimson Red (Urgent)</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Scrolling Speed */}
          <div>
            <Label className="text-sm font-semibold text-gray-800 mb-1.5 block">
              Scrolling Speed
            </Label>
            <Select
              value={formData.speed}
              onValueChange={(val) => setFormData((prev) => ({ ...prev, speed: val }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select speed" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="slow">Slow (Smooth & relaxed)</SelectItem>
                <SelectItem value="normal">Normal (Recommended)</SelectItem>
                <SelectItem value="fast">Fast (Urgent ticker)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Display Scope */}
          <div>
            <Label className="text-sm font-semibold text-gray-800 mb-1.5 block">
              Display Scope
            </Label>
            <Select
              value={formData.display_scope}
              onValueChange={(val) => setFormData((prev) => ({ ...prev, display_scope: val }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select page scope" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All App Pages (Global)</SelectItem>
                <SelectItem value="dashboard">Dashboard Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Live Interactive Preview Box */}
        <div className="pt-2">
          <div className="flex items-center gap-2 mb-2">
            <Eye className="w-4 h-4 text-indigo-600" />
            <span className="text-xs sm:text-sm font-bold text-gray-700 uppercase tracking-wider">
              Live Preview (Hover to Pause)
            </span>
            {!formData.enabled && (
              <span className="text-xs text-amber-600 font-medium ml-auto">
                (Note: Bar is currently toggled Off)
              </span>
            )}
          </div>

          <div className="rounded-lg overflow-hidden border border-gray-300 shadow-inner">
            <div className={`w-full overflow-hidden select-none py-2 px-3 ${currentThemeClass}`}>
              <div className="relative flex items-center h-8 overflow-hidden">
                <div 
                  className="admin-preview-marquee flex items-center whitespace-nowrap will-change-transform"
                  style={{
                    animationDuration: `${currentDuration}s`,
                  }}
                >
                  <div className="flex items-center flex-shrink-0">
                    {previewItems.map((item, idx) => (
                      <div key={`p-a-${idx}`} className="flex items-center">
                        <span className="mx-6 sm:mx-8 text-xs sm:text-sm font-bold uppercase tracking-wider">
                          {item}
                        </span>
                        <span className="opacity-40 text-xs font-bold select-none">•</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center flex-shrink-0" aria-hidden="true">
                    {previewItems.map((item, idx) => (
                      <div key={`p-b-${idx}`} className="flex items-center">
                        <span className="mx-6 sm:mx-8 text-xs sm:text-sm font-bold uppercase tracking-wider">
                          {item}
                        </span>
                        <span className="opacity-40 text-xs font-bold select-none">•</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-3">
          <Button
            type="submit"
            disabled={updateAnnouncement.isPending || isLoading}
            className="bg-indigo-600 hover:bg-indigo-700 text-white min-w-[160px] h-11"
          >
            {updateAnnouncement.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving Changes...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Announcement Bar
              </>
            )}
          </Button>
        </div>
      </form>

      <style>{`
        @keyframes admin-marquee-scroll {
          0% {
            transform: translate3d(0, 0, 0);
          }
          100% {
            transform: translate3d(-50%, 0, 0);
          }
        }
        .admin-preview-marquee {
          display: flex;
          width: max-content;
          animation-name: admin-marquee-scroll;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
        }
        .admin-preview-marquee:hover {
          animation-play-state: paused;
        }
      `}</style>
    </div>
  );
};

export default AdminAnnouncementBarSettings;
