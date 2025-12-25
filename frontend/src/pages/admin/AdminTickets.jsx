import React, { memo, useState, useMemo, useCallback } from 'react';
import { useAdminTickets, useUpdateTicket, useReplyToTicket } from '@/hooks/useAdminTickets';
import { useDebounce } from '@/hooks/useDebounce';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Search, RefreshCw, Filter, Edit, Send, CheckCircle, XCircle, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

const AdminTickets = memo(() => {
  const { data: tickets = [], isLoading, refetch } = useAdminTickets();
  const updateTicket = useUpdateTicket();
  const replyToTicket = useReplyToTicket();

  const [ticketSearch, setTicketSearch] = useState('');
  const [ticketStatusFilter, setTicketStatusFilter] = useState('all');
  const [ticketCategoryFilter, setTicketCategoryFilter] = useState('all');
  const [editingTicket, setEditingTicket] = useState(null);
  const [ticketResponse, setTicketResponse] = useState('');
  const [ticketsPage, setTicketsPage] = useState(1);
  const ticketsPerPage = 20;

  const debouncedSearch = useDebounce(ticketSearch, 300);

  const filteredTickets = useMemo(() => {
    return tickets.filter(t => {
      // Search filter
      const searchLower = debouncedSearch.toLowerCase();
      const matchesSearch = !debouncedSearch || 
        t.id?.toLowerCase().includes(searchLower) ||
        t.profiles?.name?.toLowerCase().includes(searchLower) ||
        t.profiles?.email?.toLowerCase().includes(searchLower) ||
        t.message?.toLowerCase().includes(searchLower);
      
      // Status filter
      const matchesStatus = ticketStatusFilter === 'all' || t.status === ticketStatusFilter;
      
      // Category filter
      const matchesCategory = ticketCategoryFilter === 'all' || t.category === ticketCategoryFilter;
      
      return matchesSearch && matchesStatus && matchesCategory;
    });
  }, [tickets, debouncedSearch, ticketStatusFilter, ticketCategoryFilter]);

  const totalTicketsPages = Math.ceil(filteredTickets.length / ticketsPerPage);
  const startTicketIndex = (ticketsPage - 1) * ticketsPerPage;
  const endTicketIndex = startTicketIndex + ticketsPerPage;
  const paginatedTickets = filteredTickets.slice(startTicketIndex, endTicketIndex);

  const handleUpdateTicketStatus = useCallback(async (ticketId, newStatus) => {
    try {
      await updateTicket.mutateAsync({ ticketId, updates: { status: newStatus } });
      setEditingTicket(null);
    } catch (error) {
      // Error handled by mutation
    }
  }, [updateTicket]);

  const handleAddTicketResponse = useCallback(async (ticketId) => {
    if (!ticketResponse.trim()) {
      toast.error('Please enter a response');
      return;
    }

    try {
      await replyToTicket.mutateAsync({ ticketId, message: ticketResponse });
      setTicketResponse('');
      setEditingTicket(null);
    } catch (error) {
      // Error handled by mutation
    }
  }, [ticketResponse, replyToTicket]);

  const handleUpdateTicketFields = useCallback(async (ticketId, updates) => {
    try {
      await updateTicket.mutateAsync({ ticketId, updates });
    } catch (error) {
      // Error handled by mutation
    }
  }, [updateTicket]);

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  if (isLoading) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 shadow-sm">
        <div className="flex flex-col gap-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="h-8 w-40 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-9 w-24 bg-gray-200 rounded animate-pulse"></div>
            </div>
            <div className="h-11 w-48 bg-gray-200 rounded animate-pulse"></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="h-10 bg-gray-200 rounded animate-pulse"></div>
            <div className="h-10 bg-gray-200 rounded animate-pulse"></div>
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border border-white/20">
          <div className="max-h-[600px] overflow-y-auto overflow-x-auto">
            <div className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10 min-w-[1400px]">
              <div className="grid grid-cols-12 gap-4 p-4">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <div key={i} className="h-4 bg-gray-200 rounded animate-pulse"></div>
                ))}
              </div>
            </div>
            <div className="divide-y divide-gray-200/50 min-w-[1400px]">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="bg-white/50 p-4">
                  <div className="grid grid-cols-12 gap-4">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((j) => (
                      <div key={j} className="h-6 bg-gray-200 rounded animate-pulse"></div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const statusConfig = {
    open: { label: 'Open', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
    in_progress: { label: 'In Progress', color: 'bg-blue-100 text-blue-700', icon: Clock },
    resolved: { label: 'Resolved', color: 'bg-green-100 text-green-700', icon: CheckCircle },
    closed: { label: 'Closed', color: 'bg-gray-100 text-gray-700', icon: XCircle }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 shadow-sm">
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Support Tickets</h2>
            <Button
              onClick={handleRefresh}
              disabled={isLoading}
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search tickets..."
              value={ticketSearch}
              onChange={(e) => setTicketSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={ticketStatusFilter} onValueChange={setTicketStatusFilter}>
            <SelectTrigger>
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={ticketCategoryFilter} onValueChange={setTicketCategoryFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="general">General</SelectItem>
              <SelectItem value="technical">Technical</SelectItem>
              <SelectItem value="billing">Billing</SelectItem>
              <SelectItem value="order">Order</SelectItem>
              <SelectItem value="account">Account</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {filteredTickets.length === 0 ? (
        <p className="text-gray-600 text-center py-8">No support tickets found</p>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-white/20">
            <div className="max-h-[600px] overflow-y-auto overflow-x-auto">
              {/* Fixed Header */}
              <div className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10 min-w-[1200px]">
                <div className="grid grid-cols-[80px_100px_100px_120px_200px_200px_200px_100px] gap-4 p-4 font-semibold text-sm">
                  <div>Status</div>
                  <div>Category</div>
                  <div>Ticket ID</div>
                  <div>Time</div>
                  <div>User</div>
                  <div>Message</div>
                  <div>Response</div>
                  <div>Actions</div>
                </div>
              </div>
              {/* Scrollable List */}
              <div className="divide-y divide-gray-200/50 min-w-[1400px]">
                {paginatedTickets.map((ticket) => {
                  const status = statusConfig[ticket.status] || statusConfig.open;
                  const StatusIcon = status.icon;

                  return (
                    <div key={ticket.id} className="bg-white/50 hover:bg-white/70 transition-colors">
                      {editingTicket === ticket.id ? (
                        <div className="p-4">
                          <div className="border-t border-gray-200 pt-4 space-y-3">
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <Label>Status</Label>
                                <Select
                                  value={ticket.status}
                                  onValueChange={(value) => handleUpdateTicketStatus(ticket.id, value)}
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="open">Open</SelectItem>
                                    <SelectItem value="in_progress">In Progress</SelectItem>
                                    <SelectItem value="resolved">Resolved</SelectItem>
                                    <SelectItem value="closed">Closed</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                <Label>Category</Label>
                                <Select
                                  value={ticket.category || 'general'}
                                  onValueChange={(value) => handleUpdateTicketFields(ticket.id, { category: value })}
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="general">General</SelectItem>
                                    <SelectItem value="technical">Technical</SelectItem>
                                    <SelectItem value="billing">Billing</SelectItem>
                                    <SelectItem value="order">Order</SelectItem>
                                    <SelectItem value="account">Account</SelectItem>
                                    <SelectItem value="other">Other</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            <div>
                              <Label>Response</Label>
                              <Textarea
                                placeholder="Add your response..."
                                value={ticketResponse}
                                onChange={(e) => setTicketResponse(e.target.value)}
                                className="min-h-[100px]"
                              />
                            </div>
                            <Button
                              size="sm"
                              onClick={() => handleAddTicketResponse(ticket.id)}
                              disabled={replyToTicket.isPending}
                              className="bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 w-full"
                            >
                              <Send className="w-4 h-4 mr-1" />
                              Send Response
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-[80px_100px_100px_120px_200px_200px_200px_100px] gap-4 p-4 items-center min-w-[1200px]">
                          {/* Status */}
                          <div className="col-span-1">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 w-fit ${status.color}`}>
                              <StatusIcon className="w-3 h-3" />
                              {status.label}
                            </span>
                          </div>
                          {/* Category */}
                          <div className="col-span-1">
                            <Badge variant="outline" className="text-xs w-full justify-center">
                              {ticket.category || 'general'}
                            </Badge>
                          </div>
                          {/* Ticket ID */}
                          <div className="col-span-1">
                            <p className="text-xs text-gray-700">{ticket.id.slice(0, 8)}...</p>
                            {ticket.order_id && (
                              <p className="text-xs text-gray-500">Order: {ticket.order_id.slice(0, 8)}</p>
                            )}
                          </div>
                          {/* Time */}
                          <div className="col-span-1">
                            <p className="text-xs text-gray-700">{new Date(ticket.created_at).toLocaleDateString()}</p>
                            <p className="text-xs text-gray-500">{new Date(ticket.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                          </div>
                          {/* User */}
                          <div className="col-span-1">
                            <p className="font-medium text-gray-900 text-xs">{ticket.profiles?.name || ticket.name || 'Unknown'}</p>
                            <p className="text-xs text-gray-600 break-all line-clamp-1">{ticket.profiles?.email || ticket.email || ''}</p>
                          </div>
                          {/* Message */}
                          <div className="col-span-1">
                            <p className="text-xs text-gray-700 line-clamp-3 break-words">{ticket.message}</p>
                          </div>
                          {/* Response */}
                          <div className="col-span-1">
                            {ticket.admin_response ? (
                              <p className="text-xs text-gray-700 line-clamp-3 break-words">{ticket.admin_response}</p>
                            ) : (
                              <p className="text-xs text-gray-400 italic">No response yet</p>
                            )}
                          </div>
                          {/* Actions */}
                          <div className="col-span-1">
                            <Button
                              size="sm"
                              onClick={() => {
                                setEditingTicket(ticket.id);
                                setTicketResponse(ticket.admin_response || '');
                              }}
                              className="bg-indigo-600 hover:bg-indigo-700 text-xs whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                            >
                              <Edit className="w-3 h-3 mr-1" />
                              Respond
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          {/* Pagination Controls */}
          <div className="flex items-center justify-between mt-4">
            <div className="text-sm text-gray-600">
              Showing {startTicketIndex + 1} to {Math.min(endTicketIndex, filteredTickets.length)} of {filteredTickets.length} tickets
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => setTicketsPage(prev => Math.max(1, prev - 1))}
                disabled={ticketsPage === 1}
                variant="outline"
                size="sm"
              >
                Previous
              </Button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalTicketsPages) }, (_, i) => {
                  let pageNum;
                  if (totalTicketsPages <= 5) {
                    pageNum = i + 1;
                  } else if (ticketsPage <= 3) {
                    pageNum = i + 1;
                  } else if (ticketsPage >= totalTicketsPages - 2) {
                    pageNum = totalTicketsPages - 4 + i;
                  } else {
                    pageNum = ticketsPage - 2 + i;
                  }
                  return (
                    <Button
                      key={pageNum}
                      onClick={() => setTicketsPage(pageNum)}
                      variant={ticketsPage === pageNum ? "default" : "outline"}
                      size="sm"
                      className={ticketsPage === pageNum ? "bg-indigo-600 hover:bg-indigo-700 text-white" : ""}
                    >
                      {pageNum}
                    </Button>
                  );
                })}
              </div>
              <Button
                onClick={() => setTicketsPage(prev => Math.min(totalTicketsPages, prev + 1))}
                disabled={ticketsPage === totalTicketsPages}
                variant="outline"
                size="sm"
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
});

AdminTickets.displayName = 'AdminTickets';

export default AdminTickets;

