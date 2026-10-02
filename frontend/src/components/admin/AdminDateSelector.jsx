import React, { memo } from 'react';
import { RefreshCw } from 'lucide-react';

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

  return (
    <div className="flex items-center justify-between gap-3 mb-4">
      {/* Date display label */}
      <div className="text-sm font-semibold text-gray-800">
        {isToday ? 'Today' : isYesterday ? 'Yesterday' : selectedDate}
      </div>

      {/* Simple Date Controls */}
      <div className="flex items-center gap-2">
        <div className="inline-flex items-center bg-white border border-gray-200 rounded-lg p-1 shadow-sm">
          <button
            type="button"
            onClick={() => onDateChange(todayDate)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              isToday 
                ? 'bg-indigo-600 text-white font-semibold shadow-sm' 
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => onDateChange(yesterdayDate)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              isYesterday 
                ? 'bg-indigo-600 text-white font-semibold shadow-sm' 
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            Yesterday
          </button>
          <input
            type="date"
            max={todayDate}
            value={selectedDate}
            onChange={(e) => {
              if (e.target.value) {
                onDateChange(e.target.value);
              }
            }}
            className="text-xs border-l border-gray-200 pl-2 pr-1 py-1 text-gray-700 bg-transparent focus:outline-none cursor-pointer"
          />
        </div>

        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            title="Refresh stats"
            className="p-2 text-gray-500 hover:text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-indigo-600' : ''}`} />
          </button>
        )}
      </div>
    </div>
  );
});

AdminDateSelector.displayName = 'AdminDateSelector';

export default AdminDateSelector;
