// TypeScript interfaces for the support chat system

export type ConversationStatus = 'open' | 'closed' | 'resolved';
export type TicketStatus = 'Pending' | 'Replied' | 'Closed';
export type TicketCategory = 'order' | 'payment' | 'account' | 'complaint' | 'other';
export type MessagePriority = 'low' | 'medium' | 'high' | 'urgent';
export type SenderRole = 'user' | 'admin';
export type AttachmentType = 'image' | 'file';

export interface Conversation {
  id: string;
  user_id: string;
  status: ConversationStatus;
  subject: string | null;
  assigned_to: string | null;
  priority: MessagePriority;
  created_at: string;
  updated_at: string;
  last_message_at: string;
  // Optional fields populated by joins
  unread_count?: number;
  last_message?: Message;
  user?: {
    id: string;
    name: string;
    email: string;
  };
  assigned_admin?: {
    id: string;
    name: string;
    email: string;
  };
  tags?: string[];
}

export interface Ticket {
  id: string;
  user_id: string;
  category: TicketCategory;
  subcategory?: string | null;
  order_id?: string | null;
  status: TicketStatus;
  created_at: string;
  updated_at: string;
  last_message_at: string;
  // Optional fields populated by joins
  user?: {
    id: string;
    name: string;
    email: string;
  };
  unread_count?: number;
}

export interface Message {
  id: string;
  conversation_id?: string | null;
  ticket_id?: string | null;
  sender_id: string;
  sender_role: SenderRole;
  content: string;
  attachment_url: string | null;
  attachment_type: AttachmentType | null;
  read_at: string | null;
  created_at: string;
  // Optional fields populated by joins
  sender?: {
    id: string;
    name: string;
    email: string;
  };
}

export interface TypingIndicator {
  id: string;
  conversation_id: string;
  user_id: string;
  is_typing: boolean;
  updated_at: string;
  // Optional fields populated by joins
  user?: {
    id: string;
    name: string;
    email: string;
  };
}

export interface AdminNote {
  id: string;
  conversation_id: string;
  admin_id: string;
  note: string;
  created_at: string;
  updated_at: string;
  // Optional fields populated by joins
  admin?: {
    id: string;
    name: string;
    email: string;
  };
}

export interface ConversationTag {
  id: string;
  conversation_id: string;
  tag: string;
  created_at: string;
}

export interface SupportMetrics {
  total_conversations: number;
  total_messages: number;
  average_response_time: number; // in seconds
  average_resolution_time: number; // in seconds
  conversations_by_day: Array<{
    date: string;
    count: number;
  }>;
  messages_by_day: Array<{
    date: string;
    count: number;
  }>;
  priority_breakdown: Array<{
    priority: MessagePriority;
    count: number;
  }>;
  assignment_stats: Array<{
    admin_id: string;
    admin_name: string;
    assigned_count: number;
  }>;
}

export interface AdminPerformance {
  admin_id: string;
  admin_name: string;
  admin_email: string;
  conversations_handled: number;
  average_response_time: number; // in seconds
  average_resolution_time: number; // in seconds
  messages_sent: number;
}

export interface ConversationFilters {
  status?: ConversationStatus | 'all';
  priority?: MessagePriority | 'all';
  assigned_to?: string | 'all' | 'unassigned';
  search?: string;
  date_from?: string;
  date_to?: string;
}

export interface MessagePagination {
  hasMore: boolean;
  isLoadingMore: boolean;
  oldestMessageId: string | null;
}

export interface SupportContextState {
  // Ticket-based support
  tickets: Ticket[];
  currentTicket: Ticket | null;
  messages: Message[];
  isLoadingTickets: boolean;
  isLoadingMessages: boolean;
  isLoadingMoreMessages: boolean;
  hasMoreMessages: boolean;
  unreadCount: number;
  isAdmin: boolean;
  isLoadingMoreTickets: boolean;
  hasMoreTickets: boolean;
  // Legacy conversation support (deprecated, kept for backward compatibility)
  conversations: Conversation[];
  currentConversation: Conversation | null;
  typingIndicators: TypingIndicator[];
  isLoadingConversations: boolean;
  isLoadingMoreConversations: boolean;
  hasMoreConversations: boolean;
}

export interface SupportContextMethods {
  // Ticket-based methods
  loadTickets: () => Promise<void>;
  loadAllTickets: (reset?: boolean) => Promise<void>;
  loadMoreTickets: () => Promise<void>;
  createTicket: (category: TicketCategory, orderId: string | null, message: string, subcategory?: string | null) => Promise<Ticket | null>;
  selectTicket: (ticketId: string) => Promise<void>;
  loadTicketMessages: (ticketId: string) => Promise<void>;
  sendTicketMessage: (content: string, attachmentUrl?: string, attachmentType?: AttachmentType) => Promise<void>;
  closeTicket: (ticketId: string) => Promise<void>;
  // Message methods (work with both tickets and conversations)
  loadMessages: (ticketIdOrConversationId: string, isTicket?: boolean) => Promise<void>;
  loadMoreMessages: () => Promise<void>;
  sendMessage: (content: string, attachmentUrl?: string, attachmentType?: AttachmentType) => Promise<void>;
  editMessage: (messageId: string, newContent: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  markMessagesAsRead: (ticketIdOrConversationId: string, isTicket?: boolean) => Promise<void>;
  getUnreadCount: () => Promise<number>;
  // Legacy conversation methods (deprecated)
  loadConversations: () => Promise<void>;
  loadAllConversations: (reset?: boolean) => Promise<void>;
  loadMoreConversations: () => Promise<void>;
  getOrCreateConversation: () => Promise<Conversation | null>;
  selectConversation: (conversationId: string) => Promise<void>;
  setTyping: (conversationId: string, isTyping: boolean) => Promise<void>;
  updateConversationStatus: (conversationId: string, status: ConversationStatus) => Promise<void>;
  closeConversation: (conversationId: string) => Promise<void>;
  assignConversation: (conversationId: string, adminId: string) => Promise<void>;
  setPriority: (conversationId: string, priority: MessagePriority) => Promise<void>;
  addTag: (conversationId: string, tag: string) => Promise<void>;
  removeTag: (conversationId: string, tag: string) => Promise<void>;
  addAdminNote: (conversationId: string, note: string) => Promise<void>;
  getAdminNotes: (conversationId: string) => Promise<AdminNote[]>;
}

export interface FileUploadResult {
  url: string;
  type: AttachmentType;
  filename: string;
}

