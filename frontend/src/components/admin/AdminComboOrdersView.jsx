import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, RefreshCw, ChevronDown, ChevronUp, RotateCcw, AlertTriangle, CheckCircle2, Clock, Layers, FileText } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminComboOrdersView() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [expandedOrders, setExpandedOrders] = useState({});
  const [retryingChildId, setRetryingChildId] = useState(null);

  const fetchComboOrders = async () => {
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

      const res = await fetch('/api/admin/combo-orders', {
        headers: {
          'Authorization': `Bearer ${jwtToken}`
        }
      });
      const data = await res.json();
      if (data.success) {
        setOrders(data.orders || []);
      } else {
        toast.error(data.error || 'Failed to fetch combo orders');
      }
    } catch (err) {
      console.error('Error fetching combo orders:', err);
      toast.error('Network error fetching combo orders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchComboOrders();
  }, []);

  const toggleExpand = (orderId) => {
    setExpandedOrders(prev => ({
      ...prev,
      [orderId]: !prev[orderId]
    }));
  };

  const handleRetryChildOrder = async (childOrderId) => {
    setRetryingChildId(childOrderId);
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

      const res = await fetch('/api/admin/retry-combo-child-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwtToken}`
        },
        body: JSON.stringify({ child_order_id: childOrderId })
      });

      const data = await res.json();
      if (data.success) {
        toast.success(`Child order retried successfully! New Provider Order ID: ${data.provider_order_id}`);
        fetchComboOrders();
      } else {
        toast.error(data.error || 'Failed to retry child order');
      }
    } catch (err) {
      console.error('Error retrying child order:', err);
      toast.error('Network error retrying child order');
    } finally {
      setRetryingChildId(null);
    }
  };

  const filteredOrders = orders.filter(o => {
    const matchesSearch = 
      !searchQuery.trim() || 
      String(o.order_number || o.id).toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.combo_service_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.link.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'all' || o.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 flex items-center gap-2">
            <Layers className="w-6 h-6 text-indigo-600" />
            Combo Orders ({filteredOrders.length})
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Expand any parent order to inspect underlying child orders, provider logs, and perform manual retries.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
            <Input
              placeholder="Search by ID, name, link..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36 h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="partial">Partial</SelectItem>
              <SelectItem value="canceled">Canceled</SelectItem>
            </SelectContent>
          </Select>

          <Button size="sm" variant="outline" onClick={fetchComboOrders} className="h-9 flex items-center gap-1.5 text-xs">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Orders List */}
      {loading ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-100 flex items-center justify-center gap-3 text-gray-500">
          <RefreshCw className="w-5 h-5 animate-spin text-indigo-600" />
          Loading combo orders...
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-2xl border border-dashed border-gray-200 text-gray-400">
          No combo orders found.
        </div>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map(order => {
            const isExpanded = !!expandedOrders[order.id];
            const childOrders = Array.isArray(order.child_orders) ? order.child_orders : [];
            const logs = Array.isArray(order.logs) ? order.logs : [];
            const failedChildCount = childOrders.filter(c => c.status === 'failed' || c.status === 'canceled').length;

            return (
              <div key={order.id} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden transition-all">
                {/* Parent Row Header */}
                <div className="p-4 md:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-gray-50/50 hover:bg-gray-50">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toggleExpand(order.id)}
                      className="p-1.5 rounded-lg bg-gray-200/60 hover:bg-gray-200 text-gray-700 transition-colors"
                      aria-label="Toggle child details"
                    >
                      {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </button>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-extrabold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                          #{order.order_number || order.id.slice(0, 8)}
                        </span>
                        <h3 className="font-bold text-gray-900 text-sm md:text-base">{order.combo_service_name}</h3>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          order.status === 'completed' ? 'bg-green-100 text-green-700' :
                          order.status === 'processing' ? 'bg-blue-100 text-blue-700' :
                          order.status === 'partial' ? 'bg-orange-100 text-orange-700' :
                          order.status === 'canceled' ? 'bg-red-100 text-red-700' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>
                          {order.status}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1 flex items-center gap-3 flex-wrap">
                        <span>Link: <a href={order.link} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">{order.link}</a></span>
                        <span>• Qty: <strong className="text-gray-700">{order.quantity}</strong></span>
                        <span>• Date: {new Date(order.created_at).toLocaleString()}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs font-semibold text-gray-700">
                    <div className="text-right">
                      <div className="text-gray-500 text-[10px] uppercase tracking-wider">Selling Price</div>
                      <div className="text-sm font-bold text-indigo-600">GH₵{Number(order.selling_price || 0).toFixed(2)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-gray-500 text-[10px] uppercase tracking-wider">Child Orders</div>
                      <div className="text-xs font-medium">
                        {childOrders.length} items
                        {failedChildCount > 0 && (
                          <span className="ml-1 text-red-600 font-bold">({failedChildCount} failed)</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Expanded Child Orders Breakdown */}
                {isExpanded && (
                  <div className="p-5 border-t border-gray-200 bg-white space-y-6">
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3 flex items-center gap-1.5">
                        <Layers className="w-4 h-4 text-indigo-600" />
                        Child Provider Orders ({childOrders.length})
                      </h4>

                      <div className="overflow-x-auto rounded-xl border border-gray-200">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-gray-100/70 text-gray-600 font-semibold uppercase">
                            <tr>
                              <th className="py-2.5 px-3">Provider</th>
                              <th className="py-2.5 px-3">Service ID</th>
                              <th className="py-2.5 px-3">Service Type</th>
                              <th className="py-2.5 px-3">Provider Order ID</th>
                              <th className="py-2.5 px-3">Qty</th>
                              <th className="py-2.5 px-3">Cost</th>
                              <th className="py-2.5 px-3">Status</th>
                              <th className="py-2.5 px-3">Error / Info</th>
                              <th className="py-2.5 px-3 text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {childOrders.map(child => (
                              <tr key={child.id} className="hover:bg-gray-50">
                                <td className="py-2.5 px-3 font-semibold text-gray-900 capitalize">{child.provider}</td>
                                <td className="py-2.5 px-3 font-mono text-gray-700">{child.provider_service_id}</td>
                                <td className="py-2.5 px-3 text-gray-700">{child.service_type}</td>
                                <td className="py-2.5 px-3 font-mono font-semibold text-indigo-600">
                                  {child.provider_order_id || <span className="text-gray-400 italic">Not placed</span>}
                                </td>
                                <td className="py-2.5 px-3 font-medium">{child.fixed_quantity}</td>
                                <td className="py-2.5 px-3 text-gray-600">GH₵{Number(child.cost || 0).toFixed(2)}</td>
                                <td className="py-2.5 px-3">
                                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                    child.status === 'completed' ? 'bg-green-100 text-green-700' :
                                    child.status === 'processing' ? 'bg-blue-100 text-blue-700' :
                                    child.status === 'failed' ? 'bg-red-100 text-red-700' :
                                    child.status === 'canceled' ? 'bg-orange-100 text-orange-700' :
                                    'bg-yellow-100 text-yellow-700'
                                  }`}>
                                    {child.status}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-red-600 text-[11px] max-w-xs truncate" title={child.error_message || ''}>
                                  {child.error_message || '-'}
                                </td>
                                <td className="py-2.5 px-3 text-right">
                                  {(child.status === 'failed' || child.status === 'canceled' || child.status === 'pending') && child.status !== 'completed' && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={retryingChildId === child.id}
                                      onClick={() => handleRetryChildOrder(child.id)}
                                      className="h-7 px-2.5 text-[11px] text-amber-700 border-amber-300 hover:bg-amber-50 flex items-center gap-1"
                                    >
                                      <RotateCcw className={`w-3 h-3 ${retryingChildId === child.id ? 'animate-spin' : ''}`} />
                                      {retryingChildId === child.id ? 'Retrying...' : 'Retry Order'}
                                    </Button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Audit Logs Accordion */}
                    {logs.length > 0 && (
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-1.5">
                          <FileText className="w-4 h-4 text-indigo-600" />
                          Execution Audit Logs ({logs.length})
                        </h4>
                        <div className="bg-gray-900 text-gray-200 rounded-xl p-3 max-h-48 overflow-y-auto font-mono text-[11px] space-y-1.5">
                          {logs.map((log, lIdx) => (
                            <div key={lIdx} className="flex items-start gap-2">
                              <span className="text-gray-500 font-sans text-[10px] whitespace-nowrap">
                                [{new Date(log.created_at).toLocaleTimeString()}]
                              </span>
                              <span className={`font-semibold uppercase ${
                                log.log_type === 'failure' ? 'text-red-400' :
                                log.log_type === 'manual_retry' ? 'text-amber-400' :
                                log.log_type === 'provider_response' ? 'text-emerald-400' :
                                'text-indigo-400'
                              }`}>
                                [{log.log_type}]
                              </span>
                              <span className="text-gray-300">{log.message}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
