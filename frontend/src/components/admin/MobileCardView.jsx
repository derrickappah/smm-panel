import React, { memo } from 'react';
import { cn } from '@/lib/utils';

/**
 * MobileCardView - A reusable card component for mobile views
 * 
 * @param {Object} item - The item to display
 * @param {Function} renderContent - Function to render the card content
 * @param {Function} renderActions - Function to render action buttons
 * @param {String} className - Additional className
 */
const MobileCardView = memo(({
  item,
  renderContent,
  renderActions,
  className = '',
  onClick
}) => {
  return (
    <div
      className={cn(
        'bg-white p-4 hover:bg-gray-50 transition-colors',
        onClick && 'cursor-pointer',
        className
      )}
      onClick={onClick}
    >
      {renderContent && renderContent(item)}
      {renderActions && (
        <div className="mt-3 pt-3 border-t border-gray-200 flex gap-2 flex-wrap">
          {renderActions(item)}
        </div>
      )}
    </div>
  );
});

MobileCardView.displayName = 'MobileCardView';

export default MobileCardView;

