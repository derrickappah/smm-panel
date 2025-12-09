import React, { memo } from 'react';
import { cn } from '@/lib/utils';
import VirtualizedList from '@/components/VirtualizedList';

/**
 * ResponsiveTable - A component that switches between table and card views based on screen size
 * 
 * @param {Array} items - Array of items to display
 * @param {Function} renderTableHeader - Function to render table header (desktop)
 * @param {Function} renderTableRow - Function to render table row (desktop)
 * @param {Function} renderCard - Function to render card (mobile)
 * @param {String} className - Additional className for container
 * @param {Number} itemHeight - Height of each item for virtual scrolling
 * @param {Number} height - Container height for virtual scrolling
 * @param {Boolean} useVirtualScroll - Whether to use virtual scrolling
 */
const ResponsiveTable = memo(({
  items = [],
  renderTableHeader,
  renderTableRow,
  renderCard,
  className = '',
  itemHeight = 80,
  height = 600,
  useVirtualScroll = false,
  emptyMessage = 'No items found',
  minTableWidth = '1200px'
}) => {
  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-gray-600">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={cn('rounded-xl border border-gray-200 w-full max-w-full overflow-hidden', className)}>
      {/* Desktop Table View */}
      <div className="hidden md:block w-full max-w-full">
        <div className="w-full max-w-full overflow-x-auto">
          <div style={{ minWidth: minTableWidth }}>
            {useVirtualScroll ? (
              <>
                <div className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                  {renderTableHeader()}
                </div>
                <div className="max-h-[600px] overflow-y-auto">
                  <VirtualizedList
                    items={items}
                    renderItem={renderTableRow}
                    itemHeight={itemHeight}
                    height={height}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                  {renderTableHeader()}
                </div>
                <div className="max-h-[600px] overflow-y-auto">
                  <div className="divide-y divide-gray-200/50">
                    {items.map((item, index) => (
                      <div key={item.id || index}>
                        {renderTableRow(item, index)}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden">
        <div className="divide-y divide-gray-200">
          {items.map((item, index) => (
            <div key={item.id || index}>
              {renderCard(item, index)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

ResponsiveTable.displayName = 'ResponsiveTable';

export default ResponsiveTable;

