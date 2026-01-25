import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ShoppingCart, Calendar, DollarSign, Package, Link as LinkIcon, AlertCircle, Tag } from 'lucide-react';

const OrderDetailsDialog = ({ order, open, onOpenChange }) => {
  if (!order) return null;

  const formatCurrency = (amount) => {
    return `₵${parseFloat(amount || 0).toFixed(2)}`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getStatusBadge = (status) => {
    const statusColors = {
      approved: 'bg-green-100 text-green-700',
      pending: 'bg-yellow-100 text-yellow-700',
      rejected: 'bg-red-100 text-red-700',
      completed: 'bg-green-100 text-green-700',
      processing: 'bg-blue-100 text-blue-700',
      cancelled: 'bg-gray-100 text-gray-700',
      canceled: 'bg-gray-100 text-gray-700',
      'in progress': 'bg-blue-100 text-blue-700',
      partial: 'bg-orange-100 text-orange-700',
      refunded: 'bg-purple-100 text-purple-700',
      refunds: 'bg-purple-100 text-purple-700',
    };
    return (
      <span className={`text-xs px-3 py-1.5 rounded-full font-medium ${statusColors[status] || 'bg-gray-100 text-gray-700'}`}>
        {status || 'pending'}
      </span>
    );
  };

  // Helper function to get Order ID based on priority
  const getOrderId = (order) => {
    // Check if smmcost_order_id exists and is valid (not "order not placed at smmcost")
    const hasSmmcost = order.smmcost_order_id &&
      String(order.smmcost_order_id).toLowerCase() !== "order not placed at smmcost" &&
      order.smmcost_order_id > 0;

    // Check if jbsmmpanel_order_id exists and is valid
    const hasJbsmmpanel = order.jbsmmpanel_order_id &&
      String(order.jbsmmpanel_order_id).toLowerCase() !== "order not placed at jbsmmpanel";

    // Check if smmgen_order_id exists and is valid (not internal UUID or "order not placed")
    const isInternalUuid = order.smmgen_order_id === order.id;
    const hasSmmgen = order.smmgen_order_id &&
      order.smmgen_order_id !== "order not placed at smm gen" &&
      !isInternalUuid;

    // Priority: SMMCost > JB SMM Panel > SMMGen
    if (hasSmmcost) {
      return { id: order.smmcost_order_id, type: 'smmcost' };
    } else if (hasJbsmmpanel) {
      return { id: order.jbsmmpanel_order_id, type: 'jbsmmpanel' };
    } else if (hasSmmgen) {
      return { id: order.smmgen_order_id, type: 'smmgen' };
    } else {
      // Fallback to truncated UUID
      return { id: order.id.slice(0, 8), type: 'uuid' };
    }
  };

  // Get Order ID display value
  const getOrderIdDisplay = (order) => {
    const orderIdInfo = getOrderId(order);
    if (orderIdInfo.type === 'uuid' && !order.smmcost_order_id && !order.jbsmmpanel_order_id && !order.smmgen_order_id) {
      return 'order not placed';
    }
    return orderIdInfo.id;
  };

  const serviceName = order.services?.name || order.promotion_packages?.name || 'N/A';
  const platform = order.services?.platform || order.promotion_packages?.platform || '';
  const isPackageOrder = !!order.promotion_package_id;
  const orderIdDisplay = getOrderIdDisplay(order);
  const orderIdInfo = getOrderId(order);

  // Check panel order IDs
  const hasSmmcost = order.smmcost_order_id &&
    String(order.smmcost_order_id).toLowerCase() !== "order not placed at smmcost" &&
    order.smmcost_order_id > 0;
  const hasJbsmmpanel = order.jbsmmpanel_order_id &&
    String(order.jbsmmpanel_order_id).toLowerCase() !== "order not placed at jbsmmpanel";
  const isInternalUuid = order.smmgen_order_id === order.id;
  const hasSmmgen = order.smmgen_order_id &&
    order.smmgen_order_id !== "order not placed at smm gen" &&
    !isInternalUuid;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-3xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 bg-gradient-to-r from-indigo-50 to-purple-50 flex-shrink-0">
          <DialogTitle className="text-xl sm:text-2xl font-bold text-gray-900">Order Details</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-6 min-h-0">
          <div className="space-y-6">
            {/* Order ID Section */}
            <div className="bg-gradient-to-br from-indigo-50 via-white to-purple-50 rounded-xl p-4 sm:p-6 border border-indigo-100 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full p-3 shadow-lg">
                  <ShoppingCart className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-1">Order ID</h3>
                  <p className="text-2xl sm:text-3xl font-bold text-indigo-600 font-mono">
                    {orderIdDisplay}
                  </p>
                  {orderIdInfo.type === 'smmcost' && (
                    <p className="text-xs text-gray-500 mt-1">SMMCost Order ID</p>
                  )}
                  {orderIdInfo.type === 'jbsmmpanel' && (
                    <p className="text-xs text-gray-500 mt-1">JBSMMPanel Order ID</p>
                  )}
                  {orderIdInfo.type === 'smmgen' && (
                    <p className="text-xs text-gray-500 mt-1">SMMGen Order ID</p>
                  )}
                  {orderIdInfo.type === 'uuid' && (
                    <p className="text-xs text-gray-500 mt-1">Internal ID (truncated)</p>
                  )}
                </div>
                <div className="text-right">
                  {getStatusBadge(order.status)}
                </div>
              </div>
            </div>

            {/* Order Information Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Service/Package */}
              <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <Package className="w-5 h-5 text-indigo-600" />
                  <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Service</h4>
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-base font-bold text-gray-900">{serviceName}</p>
                  {isPackageOrder && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 text-xs font-medium rounded">
                      <Tag className="w-3 h-3" />
                      Package
                    </span>
                  )}
                </div>
                {platform && (
                  <p className="text-sm text-gray-600 mt-1">{platform}</p>
                )}
              </div>

              {/* Quantity */}
              <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <ShoppingCart className="w-5 h-5 text-indigo-600" />
                  <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Quantity</h4>
                </div>
                <p className="text-2xl font-bold text-gray-900">{order.quantity}</p>
                <p className="text-xs text-gray-500 mt-1">units</p>
              </div>

              {/* Total Cost */}
              <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="w-5 h-5 text-indigo-600" />
                  <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Total Cost</h4>
                </div>
                <p className="text-2xl font-bold text-indigo-600">{formatCurrency(order.total_cost)}</p>
              </div>

              {/* Created Date */}
              <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="w-5 h-5 text-indigo-600" />
                  <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Created</h4>
                </div>
                <p className="text-sm font-medium text-gray-900">{formatDate(order.created_at)}</p>
                {order.completed_at && (
                  <p className="text-xs text-gray-500 mt-1">
                    <span className="font-medium">Completed:</span> {formatDate(order.completed_at)}
                  </p>
                )}
              </div>
            </div>

            {/* Link Section */}
            {order.link && (
              <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <LinkIcon className="w-5 h-5 text-indigo-600" />
                  <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Link</h4>
                </div>
                <a
                  href={order.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-indigo-600 hover:text-indigo-700 hover:underline break-all"
                >
                  {order.link}
                </a>
              </div>
            )}

            {/* Panel Order IDs Section */}
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Panel Order IDs</h4>
              <div className="space-y-2">
                {hasSmmcost && (
                  <div className="flex items-center justify-between p-2 bg-green-50 rounded-lg">
                    <span className="text-sm font-medium text-gray-700">SMMCost:</span>
                    <span className="text-sm font-mono font-bold text-gray-900">{order.smmcost_order_id}</span>
                  </div>
                )}
                {hasJbsmmpanel && (
                  <div className="flex items-center justify-between p-2 bg-orange-50 rounded-lg">
                    <span className="text-sm font-medium text-gray-700">JBSMMPanel:</span>
                    <span className="text-sm font-mono font-bold text-gray-900">{order.jbsmmpanel_order_id}</span>
                  </div>
                )}
                {hasSmmgen && (
                  <div className="flex items-center justify-between p-2 bg-blue-50 rounded-lg">
                    <span className="text-sm font-medium text-gray-700">SMMGen:</span>
                    <span className="text-sm font-mono font-bold text-gray-900">{order.smmgen_order_id}</span>
                  </div>
                )}
                {(hasSmmcost || hasJbsmmpanel || hasSmmgen) && (hasSmmcost && hasJbsmmpanel || hasSmmcost && hasSmmgen || hasJbsmmpanel && hasSmmgen) && (
                  <div className="flex items-center justify-between p-2 bg-purple-50 rounded-lg">
                    <span className="text-sm font-medium text-gray-700">Multiple panels active</span>
                    <span className="text-xs text-gray-500">SMMCost > JBSMMPanel > SMMGen priority</span>
                  </div>
                )}
                {!hasSmmcost && !hasJbsmmpanel && !hasSmmgen && (
                  <div className="flex items-center gap-2 p-2 bg-red-50 rounded-lg">
                    <AlertCircle className="w-4 h-4 text-red-500" />
                    <span className="text-sm text-red-600 italic font-medium">order not placed</span>
                  </div>
                )}
              </div>
            </div>

            {/* Additional Information */}
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Additional Information</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-500">Internal ID:</span>
                  <p className="font-mono text-gray-900 text-xs mt-1">{order.id}</p>
                </div>
                {order.service_id && (
                  <div>
                    <span className="text-gray-500">Service ID:</span>
                    <p className="font-mono text-gray-900 text-xs mt-1">{order.service_id}</p>
                  </div>
                )}
                {order.promotion_package_id && (
                  <div>
                    <span className="text-gray-500">Package ID:</span>
                    <p className="font-mono text-gray-900 text-xs mt-1">{order.promotion_package_id}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default OrderDetailsDialog;
