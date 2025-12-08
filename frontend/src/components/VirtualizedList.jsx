import React, { useMemo } from 'react';
import { FixedSizeList as List } from 'react-window';

/**
 * VirtualizedList component for rendering large lists efficiently
 * Uses react-window to only render visible items
 */
const VirtualizedList = ({
  items,
  renderItem,
  itemHeight = 80,
  height = 600,
  overscanCount = 5,
  className = '',
  ...props
}) => {
  const itemData = useMemo(() => ({
    items,
    renderItem,
  }), [items, renderItem]);

  const Row = ({ index, style, data }) => {
    const { items, renderItem } = data;
    const item = items[index];
    
    if (!item) {
      return null;
    }

    return (
      <div style={style}>
        {renderItem(item, index)}
      </div>
    );
  };

  if (!items || items.length === 0) {
    return null;
  }

  return (
    <div className={`virtualized-list ${className}`} style={{ height }}>
      <List
        height={height}
        itemCount={items.length}
        itemSize={itemHeight}
        itemData={itemData}
        overscanCount={overscanCount}
        {...props}
      >
        {Row}
      </List>
    </div>
  );
};

export default VirtualizedList;

