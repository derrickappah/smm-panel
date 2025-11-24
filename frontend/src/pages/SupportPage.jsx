import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import { 
  Mail, 
  MessageSquare, 
  HelpCircle, 
  Clock, 
  Send,
  Phone,
  MapPin,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  XCircle,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

const SupportPage = ({ user, onLogout }) => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    orderId: '',
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

  const faqs = [
    {
      id: 1,
      question: 'How do I place an order?',
      answer: 'To place an order, go to your Dashboard and fill out the order form. Select a service, enter your profile link, specify the quantity, and click "Place Order". Make sure you have sufficient balance in your account.'
    },
    {
      id: 2,
      question: 'How long does it take for orders to complete?',
      answer: 'Order completion times vary by service type. Most orders start within minutes and complete within 24-72 hours. You can track your order status in the Orders page.'
    },
    {
      id: 3,
      question: 'How do I add funds to my account?',
      answer: 'Go to your Dashboard and use the "Add Funds" section. Enter the amount you want to deposit and click "Pay with Paystack". Your balance will be updated immediately after successful payment.'
    },
    {
      id: 4,
      question: 'What payment methods do you accept?',
      answer: 'We accept payments through Paystack, which supports credit/debit cards, bank transfers, and mobile money. All payments are secure and processed instantly.'
    },
    {
      id: 5,
      question: 'Can I get a refund?',
      answer: 'Refunds are available for cancelled orders or orders that fail to complete. Contact support with your order ID for assistance. Refunds are processed back to your account balance.'
    },
    {
      id: 6,
      question: 'How do I track my order status?',
      answer: 'You can view all your orders and their status in the "Orders" page. Order statuses include: Pending, Processing, Completed, and Cancelled.'
    },
    {
      id: 7,
      question: 'What if my order is not delivered?',
      answer: 'If your order is not delivered within the expected timeframe, please contact support with your order ID. We will investigate and either complete the order or provide a refund.'
    },
    {
      id: 8,
      question: 'Is my information secure?',
      answer: 'Yes, we use industry-standard encryption and security measures to protect your data. Your payment information is processed securely through Paystack, and we never store your payment details.'
    }
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.name || !formData.email || !formData.message) {
      toast.error('Please fill in all required fields');
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
        .select('*')
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <Navbar user={user} onLogout={onLogout} />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Header */}
        <div className="text-center mb-8 sm:mb-12 animate-fadeIn">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Support Center
          </h1>
          <p className="text-gray-600 text-lg sm:text-xl max-w-2xl mx-auto">
            We're here to help! Get in touch with our support team or browse our FAQ.
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Contact Form */}
          <div className="lg:col-span-2">
            <div className="glass p-6 sm:p-8 rounded-3xl animate-slideUp">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-xl flex items-center justify-center">
                  <MessageSquare className="w-6 h-6 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900">Contact Us</h2>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid sm:grid-cols-2 gap-5">
                  <div>
                    <Label htmlFor="name" className="text-gray-700 font-medium mb-2 block">
                      Name
                    </Label>
                    <Input
                      id="name"
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="rounded-xl bg-white/70"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="email" className="text-gray-700 font-medium mb-2 block">
                      Email
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="rounded-xl bg-white/70"
                      required
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="orderId" className="text-gray-700 font-medium mb-2 block">
                    Order ID <span className="text-gray-500 font-normal text-sm">(Optional)</span>
                  </Label>
                  <Input
                    id="orderId"
                    type="text"
                    value={formData.orderId}
                    onChange={(e) => setFormData({ ...formData, orderId: e.target.value })}
                    placeholder="e.g., abc123-def456-789 or 123e4567-e89b-12d3-a456-426614174000"
                    className="rounded-xl bg-white/70"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    If your inquiry is about a specific order, please provide the Order ID. You can find it in your Orders page.
                  </p>
                </div>

                <div>
                  <Label htmlFor="message" className="text-gray-700 font-medium mb-2 block">
                    Message
                  </Label>
                  <Textarea
                    id="message"
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    placeholder="Please provide details about your issue or question..."
                    className="rounded-xl bg-white/70 min-h-[150px]"
                    required
                  />
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full btn-hover bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white py-6 rounded-full"
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
          <div className="space-y-6">
            {/* Contact Information */}
            <div className="glass p-6 rounded-3xl animate-slideUp">
              <h3 className="text-xl font-bold text-gray-900 mb-4">Get in Touch</h3>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <Mail className="w-5 h-5 text-indigo-600 mt-1 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-gray-900">Email</p>
                    <p className="text-gray-600 text-sm">support@boostupgh.com</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Clock className="w-5 h-5 text-indigo-600 mt-1 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-gray-900">Response Time</p>
                    <p className="text-gray-600 text-sm">Within 24 hours</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <HelpCircle className="w-5 h-5 text-indigo-600 mt-1 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-gray-900">Support Hours</p>
                    <p className="text-gray-600 text-sm">24/7 Available</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="glass p-6 rounded-3xl animate-slideUp">
              <h3 className="text-xl font-bold text-gray-900 mb-4">Quick Actions</h3>
              <div className="space-y-3">
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => navigate('/orders')}
                >
                  <MessageSquare className="w-4 h-4 mr-2" />
                  View My Orders
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
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
          <div className="mt-12">
            <div className="mb-6">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">My Support Tickets</h2>
              <p className="text-gray-600">View your support requests and responses</p>
            </div>

            {loadingTickets ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-indigo-600 mx-auto"></div>
              </div>
            ) : (
              <div className="glass p-4 sm:p-6 rounded-3xl animate-slideUp">
                {/* Search and Filter */}
                <div className="flex flex-col sm:flex-row gap-4 mb-6">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <Input
                      placeholder="Search by ticket ID, message, or order ID..."
                      value={ticketSearch}
                      onChange={(e) => setTicketSearch(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Select value={ticketStatusFilter} onValueChange={setTicketStatusFilter}>
                    <SelectTrigger className="w-full sm:w-48">
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
                        <p className="text-gray-600 text-lg mb-2">
                          {myTickets.length === 0 ? 'You haven\'t submitted any support tickets yet' : 'No tickets match your filters'}
                        </p>
                        {ticketSearch || ticketStatusFilter !== 'all' ? (
                          <Button
                            onClick={() => {
                              setTicketSearch('');
                              setTicketStatusFilter('all');
                            }}
                            variant="outline"
                            className="mt-4"
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
                      <div className="overflow-x-auto">
                        <div className="min-w-[1000px]">
                          {/* Fixed Header */}
                          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white sticky top-0 z-10">
                            <div className="grid grid-cols-[1fr_1.5fr_2fr_2fr_1.5fr] gap-4 p-4 font-semibold text-sm text-center">
                              <div>Status</div>
                              <div>Ticket ID</div>
                              <div>Message</div>
                              <div>Response</div>
                              <div>Date</div>
                            </div>
                          </div>

                          {/* Tickets List */}
                          <div className="divide-y divide-gray-200">
                            {paginatedTickets.map((ticket) => {
                              const statusConfig = {
                                open: { label: 'Open', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
                                in_progress: { label: 'In Progress', color: 'bg-blue-100 text-blue-700', icon: Clock },
                                resolved: { label: 'Resolved', color: 'bg-green-100 text-green-700', icon: CheckCircle },
                                closed: { label: 'Closed', color: 'bg-gray-100 text-gray-700', icon: XCircle }
                              };
                              const status = statusConfig[ticket.status] || statusConfig.open;
                              const StatusIcon = status.icon;

                              return (
                                <div key={ticket.id} className="bg-white/50 hover:bg-white/70 transition-colors">
                                  <div className="grid grid-cols-[1fr_1.5fr_2fr_2fr_1.5fr] gap-4 p-4 items-center">
                                    {/* Status */}
                                    <div className="flex justify-center">
                                      <span className={`px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 whitespace-nowrap ${status.color}`}>
                                        <StatusIcon className="w-3 h-3" />
                                        {status.label}
                                      </span>
                                    </div>
                                    {/* Ticket ID */}
                                    <div className="text-center">
                                      <p className="text-xs text-gray-700 break-all">{ticket.id}</p>
                                      {ticket.order_id && (
                                        <p className="text-xs text-gray-500 mt-1">Order: {ticket.order_id.slice(0, 8)}...</p>
                                      )}
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
                                      <p className="text-sm text-gray-700">{new Date(ticket.created_at).toLocaleDateString()}</p>
                                      <p className="text-xs text-gray-500">{new Date(ticket.created_at).toLocaleTimeString()}</p>
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
                          <p className="text-sm text-gray-600">
                            Showing {startTicketIndex + 1} to {Math.min(endTicketIndex, filteredTickets.length)} of {filteredTickets.length} tickets
                          </p>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setTicketsPage(prev => Math.max(1, prev - 1))}
                              disabled={ticketsPage === 1}
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
                                    className={`w-8 h-8 p-0 ${ticketsPage === pageNum ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white' : ''}`}
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

        {/* FAQ Section */}
        <div className="mt-12">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-2">Frequently Asked Questions</h2>
            <p className="text-gray-600">Find answers to common questions</p>
          </div>

          <div className="glass p-6 sm:p-8 rounded-3xl animate-slideUp">
            <div className="space-y-4">
              {faqs.map((faq) => (
                <div
                  key={faq.id}
                  className="border border-gray-200 rounded-xl overflow-hidden transition-all"
                >
                  <button
                    onClick={() => toggleFaq(faq.id)}
                    className="w-full px-4 sm:px-6 py-4 sm:py-5 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
                  >
                    <span className="font-medium text-gray-900 pr-4">{faq.question}</span>
                    {openFaq === faq.id ? (
                      <ChevronUp className="w-5 h-5 text-indigo-600 flex-shrink-0" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    )}
                  </button>
                  {openFaq === faq.id && (
                    <div className="px-4 sm:px-6 pb-4 sm:pb-5 pt-0">
                      <p className="text-gray-600 leading-relaxed">{faq.answer}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SupportPage;

