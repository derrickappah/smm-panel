import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import SEO from '@/components/SEO';
import { generateFAQSchema } from '@/utils/schema';
import { useFAQ } from '@/hooks/useFAQ';
import { 
  Mail, 
  MessageSquare, 
  HelpCircle, 
  Clock, 
  Send,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  XCircle,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Video,
} from 'lucide-react';

const SupportPage = ({ user, onLogout }) => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    orderId: '',
    category: 'order',
    message: ''
  });

  // Update form data when user loads
  useEffect(() => {
    if (user) {
      setFormData(prev => ({
        ...prev,
        name: user.name || '',
        email: user.email || ''
      }));
    }
  }, [user]);
  const [loading, setLoading] = useState(false);
  const [openFaq, setOpenFaq] = useState(null);
  const [myTickets, setMyTickets] = useState([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  
  // Search and filter states
  const [ticketSearch, setTicketSearch] = useState('');
  const [ticketStatusFilter, setTicketStatusFilter] = useState('all');
  const [ticketsPage, setTicketsPage] = useState(1);
  const ticketsPerPage = 20;

  // Fetch FAQs from backend
  const { data: faqs = [], isLoading: isLoadingFAQs } = useFAQ();

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.name || !formData.email || !formData.message) {
      toast.error('Please fill in all required fields');
      return;
    }

    // Validate Order ID when category is "order"
    if (formData.category === 'order' && !formData.orderId?.trim()) {
      toast.error('Order ID is required for order-related inquiries');
      return;
    }

    setLoading(true);
    
    try {
      // Get current user ID if logged in
      const { data: { user: authUser } } = await supabase.auth.getUser();
      
      // Insert support ticket into database
      const { data, error } = await supabase
        .from('support_tickets')
        .insert({
          user_id: authUser?.id || null,
          name: formData.name,
          email: formData.email,
          order_id: formData.orderId || null,
          category: formData.category,
          message: formData.message,
          status: 'open'
        })
        .select()
        .single();
      
      if (error) {
        console.error('Error creating support ticket:', error);
        throw error;
      }
      
      toast.success('Support request submitted successfully! Ticket ID: ' + data.id.slice(0, 8) + '. We will get back to you soon.');
      setFormData({
        name: user?.name || '',
        email: user?.email || '',
        orderId: '',
        category: 'order',
        message: ''
      });
      // Refresh tickets list
      if (user) {
        fetchMyTickets();
      }
    } catch (error) {
      console.error('Support form error:', error);
      toast.error('Failed to submit support request: ' + (error.message || 'Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const toggleFaq = (id) => {
    setOpenFaq(openFaq === id ? null : id);
  };

  // Fetch user's support tickets
  const fetchMyTickets = async () => {
    if (!user) return;
    
    setLoadingTickets(true);
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;

      const { data, error } = await supabase
        .from('support_tickets')
        .select('id, user_id, message, status, category, created_at, updated_at, admin_response')
        .eq('user_id', authUser.id)
        .order('created_at', { ascending: false });

      if (error) {
        // Table might not exist yet
        if (error.code === '42P01') {
          console.warn('Support tickets table does not exist. Run CREATE_SUPPORT_TICKETS.sql migration.');
          setMyTickets([]);
          return;
        }
        throw error;
      }

      setMyTickets(data || []);
    } catch (error) {
      console.error('Error fetching tickets:', error);
      setMyTickets([]);
    } finally {
      setLoadingTickets(false);
    }
  };

  // Fetch tickets when component loads
  useEffect(() => {
    if (user) {
      fetchMyTickets();
      
      // Subscribe to real-time updates for user's tickets
      const ticketsChannel = supabase
        .channel('user-support-tickets')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'support_tickets',
            filter: `user_id=eq.${user.id}`
          },
          () => {
            fetchMyTickets();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(ticketsChannel);
      };
    }
  }, [user]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setTicketsPage(1);
  }, [ticketStatusFilter, ticketSearch]);

  const structuredData = generateFAQSchema(faqs);
  
  const supportKeywords = [
    'BoostUp GH support',
    'SMM panel support',
    'help',
    'FAQ',
    'customer service',
    'contact support',
    'SMM panel help',
    'support center',
    'customer support',
    'technical support',
    'order help',
    'payment help',
    'account help',
    '24/7 support',
    'support Ghana'
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <SEO
        title="Support Center - Help & FAQ | BoostUp GH"
        description="Get help with your BoostUp GH account, orders, payments, and more. Browse our comprehensive FAQ or contact our 24/7 support team for assistance. SMM panel support, customer service, technical help."
        keywords={supportKeywords}
        canonical="/support"
        structuredData={structuredData}
      />
      <Navbar user={user} onLogout={onLogout} />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 md:pt-6 pb-6 sm:pb-8 lg:pb-12">
        {/* Header */}
        <div className="text-center mb-6 sm:mb-8 lg:mb-12 animate-fadeIn">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2 sm:mb-4">
            Support Center
          </h1>
          <p className="text-sm sm:text-base lg:text-lg text-gray-600 max-w-2xl mx-auto">
            We're here to help! Get in touch with our support team or browse our FAQ.
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6 lg:gap-8">
          {/* Contact Form */}
          <div className="lg:col-span-2">
            <div className="bg-white border border-gray-200 rounded-lg p-6 sm:p-8 shadow-sm animate-slideUp">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
                  <MessageSquare className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-600" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Contact Us</h2>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name" className="text-sm font-medium text-gray-700 mb-2 block">
                      Name
                    </Label>
                    <Input
                      id="name"
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full h-11 rounded-lg border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="email" className="text-sm font-medium text-gray-700 mb-2 block">
                      Email
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full h-11 rounded-lg border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      required
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="category" className="text-sm font-medium text-gray-700 mb-2 block">
                    Category
                  </Label>
                  <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
                    <SelectTrigger className="w-full h-11 rounded-lg border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="general">General</SelectItem>
                      <SelectItem value="technical">Technical</SelectItem>
                      <SelectItem value="payment">Payment</SelectItem>
                      <SelectItem value="order">Order</SelectItem>
                      <SelectItem value="account">Account</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="orderId" className="text-sm font-medium text-gray-700 mb-2 block">
                    Order ID{' '}
                    {formData.category === 'order' ? (
                      <span className="text-red-600 font-normal text-xs">(Required)</span>
                    ) : (
                      <span className="text-gray-500 font-normal text-xs">(Optional)</span>
                    )}
                  </Label>
                  
                  <Input
                    id="orderId"
                    type="text"
                    value={formData.orderId}
                    onChange={(e) => setFormData({ ...formData, orderId: e.target.value })}
                    placeholder="e.g., abc123-def456-789 or 123e4567-e89b-12d3-a456-426614174000"
                    className={`w-full h-11 rounded-lg border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                      formData.category === 'order' && !formData.orderId?.trim() 
                        ? 'border-red-300 focus:border-red-500 focus:ring-red-500' 
                        : ''
                    }`}
                    required={formData.category === 'order'}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {formData.category === 'order' 
                      ? 'Order ID is required for order-related inquiries. You can find it in your Orders page.'
                      : 'If your inquiry is about a specific order, please provide the Order ID. You can find it in your Orders page.'}
                  </p>
                </div>

                <div>
                  <Label htmlFor="message" className="text-sm font-medium text-gray-700 mb-2 block">
                    Message
                  </Label>
                  <Textarea
                    id="message"
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    placeholder="Please provide details about your issue or question..."
                    className="w-full rounded-lg border-gray-300 min-h-[150px] focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    required
                  />
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    'Sending...'
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Send Message
                    </>
                  )}
                </Button>
              </form>
            </div>
          </div>

          {/* Contact Info & Quick Links */}
          <div className="space-y-4 sm:space-y-6">
            {/* Contact Information */}
            <div className="bg-white border border-gray-200 rounded-lg p-5 sm:p-6 shadow-sm animate-slideUp">
              <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-4">Get in Touch</h3>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Mail className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Email</p>
                    <p className="text-xs sm:text-sm text-gray-600">admin@boostupgh.com</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Clock className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Response Time</p>
                    <p className="text-xs sm:text-sm text-gray-600">Within 24 hours</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                    <HelpCircle className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Support Hours</p>
                    <p className="text-xs sm:text-sm text-gray-600">24/7 Available</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white border border-gray-200 rounded-lg p-5 sm:p-6 shadow-sm animate-slideUp">
              <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-4">Quick Actions</h3>
              <div className="space-y-2 sm:space-y-3">
                <Button
                  variant="outline"
                  className="w-full justify-start h-10 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                  onClick={() => navigate('/orders')}
                >
                  <MessageSquare className="w-4 h-4 mr-2" />
                  View My Orders
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start h-10 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                  onClick={() => navigate('/dashboard')}
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Go to Dashboard
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* My Support Tickets */}
        {user && (
          <div className="mt-8 sm:mt-12">
            <div className="mb-6">
              <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 mb-2">My Support Tickets</h2>
              <p className="text-sm sm:text-base text-gray-600">View your support requests and responses</p>
            </div>

            {loadingTickets ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-200 border-t-indigo-600 mx-auto"></div>
                <p className="text-sm text-gray-600 mt-4">Loading tickets...</p>
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 shadow-sm animate-slideUp">
                {/* Search and Filter */}
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-6">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
                    <Input
                      placeholder="Search by ticket ID, message, or order ID..."
                      value={ticketSearch}
                      onChange={(e) => setTicketSearch(e.target.value)}
                      className="pl-10 h-11 rounded-lg border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                  <Select value={ticketStatusFilter} onValueChange={setTicketStatusFilter}>
                    <SelectTrigger className="w-full sm:w-48 h-11 rounded-lg border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500">
                      <Filter className="w-4 h-4 mr-2" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="resolved">Resolved</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Filter and display tickets */}
                {(() => {
                  const filteredTickets = myTickets.filter(ticket => {
                    const searchLower = ticketSearch.toLowerCase();
                    const matchesSearch = 
                      !ticketSearch ||
                      ticket.id.toLowerCase().includes(searchLower) ||
                      ticket.message.toLowerCase().includes(searchLower) ||
                      (ticket.order_id && ticket.order_id.toLowerCase().includes(searchLower));
                    
                    const matchesStatus = ticketStatusFilter === 'all' || ticket.status === ticketStatusFilter;
                    
                    return matchesSearch && matchesStatus;
                  });

                  // Pagination
                  const totalTicketsPages = Math.ceil(filteredTickets.length / ticketsPerPage);
                  const startTicketIndex = (ticketsPage - 1) * ticketsPerPage;
                  const endTicketIndex = startTicketIndex + ticketsPerPage;
                  const paginatedTickets = filteredTickets.slice(startTicketIndex, endTicketIndex);

                  if (filteredTickets.length === 0) {
                    return (
                      <div className="text-center py-12">
                        <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                        <p className="text-gray-600 text-base sm:text-lg mb-2">
                          {myTickets.length === 0 ? 'You haven\'t submitted any support tickets yet' : 'No tickets match your filters'}
                        </p>
                        {ticketSearch || ticketStatusFilter !== 'all' ? (
                          <Button
                            onClick={() => {
                              setTicketSearch('');
                              setTicketStatusFilter('all');
                            }}
                            variant="outline"
                            className="mt-4 h-10 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                          >
                            Clear Filters
                          </Button>
                        ) : null}
                      </div>
                    );
                  }

                  return (
                    <>
                      {/* Tickets Table */}
                      <div className="overflow-x-auto -mx-4 sm:mx-0">
                        <div className="min-w-[1000px]">
                          {/* Fixed Header */}
                          <div className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                            <div className="grid grid-cols-[1fr_1fr_1.5fr_2fr_2fr_1.5fr] gap-4 p-4 font-semibold text-xs sm:text-sm text-gray-700">
                              <div className="text-center">Status</div>
                              <div className="text-center">Category</div>
                              <div className="text-center">Ticket ID</div>
                              <div className="text-center">Message</div>
                              <div className="text-center">Response</div>
                              <div className="text-center">Date</div>
                            </div>
                          </div>

                          {/* Tickets List */}
                          <div className="divide-y divide-gray-200">
                            {paginatedTickets.map((ticket) => {
                              const statusConfig = {
                                open: { label: 'Open', color: 'bg-yellow-100 text-yellow-700 border-yellow-200', icon: Clock },
                                in_progress: { label: 'In Progress', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: Clock },
                                resolved: { label: 'Resolved', color: 'bg-green-100 text-green-700 border-green-200', icon: CheckCircle },
                                closed: { label: 'Closed', color: 'bg-gray-100 text-gray-700 border-gray-200', icon: XCircle }
                              };
                              const status = statusConfig[ticket.status] || statusConfig.open;
                              const StatusIcon = status.icon;

                              const categoryLabels = {
                                technical: 'Tech',
                                payment: 'Payment',
                                order: 'Order',
                                account: 'Account',
                                general: 'General',
                                other: 'Other'
                              };

                              return (
                                <div key={ticket.id} className="bg-white hover:bg-gray-50 transition-colors">
                                  <div className="grid grid-cols-[1fr_1fr_1.5fr_2fr_2fr_1.5fr] gap-4 p-4 items-center">
                                    {/* Status */}
                                    <div className="flex justify-center">
                                      <span className={`px-2.5 py-1 rounded border text-xs font-medium flex items-center gap-1.5 whitespace-nowrap ${status.color}`}>
                                        <StatusIcon className="w-3 h-3" />
                                        {status.label}
                                      </span>
                                    </div>
                                    {/* Category */}
                                    <div className="text-center">
                                      <Badge variant="outline" className="text-xs">
                                        {categoryLabels[ticket.category] || ticket.category || 'General'}
                                      </Badge>
                                    </div>
                                    {/* Ticket ID */}
                                    <div className="text-center">
                                      <p className="text-xs text-gray-700 break-all">{ticket.id.slice(0, 8)}...</p>
                                    </div>
                                    {/* Message */}
                                    <div className="text-center">
                                      <p className="text-sm text-gray-700 line-clamp-2" title={ticket.message}>
                                        {ticket.message}
                                      </p>
                                    </div>
                                    {/* Response */}
                                    <div className="text-center">
                                      {ticket.admin_response ? (
                                        <div>
                                          <p className="text-sm text-gray-700 line-clamp-2" title={ticket.admin_response}>
                                            {ticket.admin_response}
                                          </p>
                                          <p className="text-xs text-gray-500 mt-1">
                                            {new Date(ticket.updated_at).toLocaleDateString()}
                                          </p>
                                        </div>
                                      ) : (
                                        <span className="text-xs text-yellow-600 flex items-center justify-center gap-1">
                                          <Clock className="w-3 h-3" />
                                          Awaiting response
                                        </span>
                                      )}
                                    </div>
                                    {/* Date */}
                                    <div className="text-center">
                                      <p className="text-xs sm:text-sm text-gray-700">{new Date(ticket.created_at).toLocaleDateString()}</p>
                                      <p className="text-xs text-gray-500">{new Date(ticket.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Pagination */}
                      {totalTicketsPages > 1 && (
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 pt-4 border-t border-gray-200">
                          <p className="text-xs sm:text-sm text-gray-600">
                            Showing {startTicketIndex + 1} to {Math.min(endTicketIndex, filteredTickets.length)} of {filteredTickets.length} tickets
                          </p>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setTicketsPage(prev => Math.max(1, prev - 1))}
                              disabled={ticketsPage === 1}
                              className="h-9 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
                            >
                              <ChevronLeft className="w-4 h-4" />
                            </Button>
                            <div className="flex items-center gap-1">
                              {Array.from({ length: Math.min(5, totalTicketsPages) }, (_, i) => {
                                let pageNum;
                                if (totalTicketsPages <= 5) {
                                  pageNum = i + 1;
                                } else if (ticketsPage >= totalTicketsPages - 2) {
                                  pageNum = totalTicketsPages - 4 + i;
                                } else if (ticketsPage <= 3) {
                                  pageNum = i + 1;
                                } else {
                                  pageNum = ticketsPage - 2 + i;
                                }
                                return (
                                  <Button
                                    key={pageNum}
                                    variant={ticketsPage === pageNum ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => setTicketsPage(pageNum)}
                                    className={`w-9 h-9 p-0 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                                      ticketsPage === pageNum ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : ''
                                    }`}
                                  >
                                    {pageNum}
                                  </Button>
                                );
                              })}
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setTicketsPage(prev => Math.min(totalTicketsPages, prev + 1))}
                              disabled={ticketsPage === totalTicketsPages}
                              className="h-9 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {/* Tutorials Section */}
        <div className="mt-8 sm:mt-12">
          <div className="text-center mb-6 sm:mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">Video Tutorials</h2>
            <p className="text-sm sm:text-base text-gray-600">Watch step-by-step guides to get started</p>
          </div>

          <div className="grid md:grid-cols-2 gap-4 sm:gap-6 mb-8 sm:mb-12">
            {/* Likes Tutorial */}
            <div className="bg-white border border-gray-200 rounded-lg p-5 sm:p-6 shadow-sm animate-slideUp">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-pink-100 rounded-lg flex items-center justify-center">
                  <Video className="w-5 h-5 text-pink-600" />
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-gray-900">How to Order Likes</h3>
              </div>
              <div className="aspect-video rounded-lg overflow-hidden bg-gray-900 mb-4">
                <video
                  controls
                  className="w-full h-full"
                  preload="metadata"
                >
                  <source 
                    src="https://spihsvdchouynfbsotwq.supabase.co/storage/v1/object/public/storage/likes%20tutorial.mp4" 
                    type="video/mp4" 
                  />
                  Your browser does not support the video tag.
                </video>
              </div>
              <p className="text-xs sm:text-sm text-gray-600">
                Learn how to place an order for Instagram likes step by step.
              </p>
            </div>

            {/* Followers Tutorial */}
            <div className="bg-white border border-gray-200 rounded-lg p-5 sm:p-6 shadow-sm animate-slideUp">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Video className="w-5 h-5 text-blue-600" />
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-gray-900">How to Order Followers</h3>
              </div>
              <div className="aspect-video rounded-lg overflow-hidden bg-gray-900 mb-4">
                <video
                  controls
                  className="w-full h-full"
                  preload="metadata"
                >
                  <source 
                    src="https://spihsvdchouynfbsotwq.supabase.co/storage/v1/object/public/storage/followers%20tutorial.mp4" 
                    type="video/mp4" 
                  />
                  Your browser does not support the video tag.
                </video>
              </div>
              <p className="text-xs sm:text-sm text-gray-600">
                Learn how to place an order for Instagram followers step by step.
              </p>
            </div>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="mt-8 sm:mt-12">
          <div className="text-center mb-6 sm:mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">Frequently Asked Questions</h2>
            <p className="text-sm sm:text-base text-gray-600">Find answers to common questions</p>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-5 sm:p-6 lg:p-8 shadow-sm animate-slideUp">
            {isLoadingFAQs ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-200 border-t-indigo-600 mx-auto"></div>
              </div>
            ) : faqs.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <HelpCircle className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                <p>No FAQs available at the moment.</p>
              </div>
            ) : (
              <div className="space-y-3 sm:space-y-4">
                {faqs.map((faq) => (
                  <div
                    key={faq.id}
                    className="border border-gray-200 rounded-lg overflow-hidden transition-all hover:border-gray-300"
                  >
                    <button
                      onClick={() => toggleFaq(faq.id)}
                      className="w-full px-4 sm:px-6 py-4 sm:py-5 flex items-center justify-between text-left hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-inset"
                      aria-expanded={openFaq === faq.id}
                    >
                      <span className="text-sm sm:text-base font-medium text-gray-900 pr-4">{faq.question}</span>
                      {openFaq === faq.id ? (
                        <ChevronUp className="w-5 h-5 text-indigo-600 flex-shrink-0" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
                      )}
                    </button>
                    {openFaq === faq.id && (
                      <div className="px-4 sm:px-6 pb-4 sm:pb-5 pt-0">
                        <p className="text-sm sm:text-base text-gray-600 leading-relaxed whitespace-pre-line">{faq.answer}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
};

export default SupportPage;

