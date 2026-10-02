import React, { memo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  RotateCcw, 
  RefreshCw,
  Clock,
  CalendarDays
} from 'lucide-react';

const AdminDateSelector = memo(({
  selectedDate,
  todayDate,
  onDateChange,
  onRefresh,
  isRefreshing = false
}) => {
  const isToday = selectedDate === todayDate;

  // Calculate yesterday's date string (YYYY-MM-DD)
  const yesterdayDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  const isYesterday = selectedDate === yesterdayDate;

  // Step backward by 1 day
  const handlePrevDay = () => {
    const parts = selectedDate.split('-');
    const current = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    current.setDate(current.getDate() - 1);
    const nextStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
    onDateChange(nextStr);
  };

  // Step forward by 1 day (cannot go beyond today)
  const handleNextDay = () => {
    if (isToday) return;
    const parts = selectedDate.split('-');
    const current = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    current.setDate(current.getDate() + 1);
    const nextStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
    if (nextStr > todayDate) return;
    onDateChange(nextStr);
  };

  // Formatted date string for human reading
  const formattedDate = (() => {
    try {
      const parts = selectedDate.split('-');
      const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      return d.toLocaleDateString(undefined, {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return selectedDate;
    }
  })();

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 sm:p-4 shadow-sm mb-6 transition-all duration-200">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
        
        {/* Left: Active Date Status & Label */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <div className={`p-2 rounded-lg ${isToday ? 'bg-indigo-50 text-indigo-600' : 'bg-amber-50 text-amber-600'}`}>
            <CalendarDays className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-gray-900">
                {isToday ? 'Stats for Today' : isYesterday ? 'Stats for Yesterday' : `Stats for ${formattedDate}`}
              </span>
              {isToday ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-green-50 text-green-700 px-2 py-0.5 rounded-full border border-green-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                  Live Today
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">
                  <Clock className="w-3 h-3 text-amber-600" />
                  Historical Day ({formattedDate})
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {isToday 
                ? 'Showing 24h activity from midnight to now' 
                : `Showing isolated 24h metrics on ${formattedDate}`}
            </p>
          </div>
        </div>

        {/* Right: Date Controls & Presets */}
        <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap">
          
          {/* Quick Preset Pills */}
          <div className="inline-flex items-center bg-gray-100 p-1 rounded-lg border border-gray-200">
            <button
              type="button"
              onClick={() => onDateChange(todayDate)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                isToday 
                  ? 'bg-white text-indigo-600 shadow-sm' 
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200/60'
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => onDateChange(yesterdayDate)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                isYesterday 
                  ? 'bg-white text-indigo-600 shadow-sm' 
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200/60'
              }`}
            >
              Yesterday
            </button>
          </div>

          {/* Steppers */}
          <div className="inline-flex items-center rounded-lg border border-gray-200 bg-white">
            <button
              type="button"
              onClick={handlePrevDay}
              title="Previous day"
              className="p-2 hover:bg-gray-50 text-gray-600 hover:text-gray-900 border-r border-gray-200 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleNextDay}
              disabled={isToday}
              title={isToday ? "Cannot step into the future" : "Next day"}
              className={`p-2 transition-colors ${
                isToday 
                  ? 'text-gray-300 cursor-not-allowed bg-gray-50' 
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Custom Date Input */}
          <div className="relative flex items-center">
            <div className="absolute left-2.5 pointer-events-none text-gray-400">
              <CalendarIcon className="w-4 h-4" />
            </div>
            <Input
              type="date"
              max={todayDate}
              value={selectedDate}
              onChange={(e) => {
                if (e.target.value) {
                  onDateChange(e.target.value);
                }
              }}
              className="pl-8 pr-2.5 py-1 h-9 text-xs sm:text-sm font-medium w-36 sm:w-40 border-gray-200 bg-white focus-visible:ring-indigo-500 cursor-pointer"
            />
          </div>

          {/* Reset to Today button (only shown when not on Today) */}
          {!isToday && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onDateChange(todayDate)}
              className="h-9 px-2.5 sm:px-3 text-xs font-semibold text-indigo-600 border-indigo-200 bg-indigo-50/50 hover:bg-indigo-100/70 hover:text-indigo-700"
              title="Return to today's stats"
            >
              <RotateCcw className="w-3.5 h-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">Back to Today</span>
            </Button>
          )}

          {/* Refresh Button */}
          {onRefresh && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={onRefresh}
              disabled={isRefreshing}
              className="h-9 w-9 text-gray-600 border-gray-200 hover:bg-gray-50"
              title="Refresh stats for selected day"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-indigo-600' : ''}`} />
            </Button>
          )}
        </div>

      </div>
    </div>
  );
});

AdminDateSelector.displayName = 'AdminDateSelector';

export default AdminDateSelector;
