import { supabase } from '@/lib/supabase';
import type { SupportMetrics, AdminPerformance } from '@/types/support';

export const getSupportMetrics = async (
  startDate?: string,
  endDate?: string
): Promise<SupportMetrics> => {
  try {
    let query = supabase.from('conversations').select('*', { count: 'exact' });
    let messagesQuery = supabase.from('messages').select('*', { count: 'exact' });

    if (startDate) {
      query = query.gte('created_at', startDate);
      messagesQuery = messagesQuery.gte('created_at', startDate);
    }
    if (endDate) {
      query = query.lte('created_at', endDate);
      messagesQuery = messagesQuery.lte('created_at', endDate);
    }

    const [conversationsResult, messagesResult] = await Promise.all([
      query,
      messagesQuery,
    ]);

    const totalConversations = conversationsResult.count || 0;
    const totalMessages = messagesResult.count || 0;

    // Get conversations by day
    const { data: conversationsData } = await supabase
      .from('conversations')
      .select('created_at')
      .order('created_at', { ascending: true });

    const conversationsByDay = groupByDay(conversationsData || [], 'created_at');

    // Get messages by day
    const { data: messagesData } = await supabase
      .from('messages')
      .select('created_at')
      .order('created_at', { ascending: true });

    const messagesByDay = groupByDay(messagesData || [], 'created_at');

    // Get priority breakdown
    const { data: priorityData } = await supabase
      .from('conversations')
      .select('priority');

    const priorityBreakdown = (priorityData || []).reduce((acc, conv) => {
      const priority = conv.priority || 'medium';
      acc[priority] = (acc[priority] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Get assignment stats
    const { data: assignmentData } = await supabase
      .from('conversations')
      .select('assigned_to')
      .not('assigned_to', 'is', null);

    // Get admin profiles separately
    const adminIds = [...new Set((assignmentData || []).map(c => c.assigned_to).filter(Boolean))];
    let adminProfilesMap = {};
    if (adminIds.length > 0) {
      const { data: adminProfiles } = await supabase
        .from('profiles')
        .select('id, name')
        .in('id', adminIds);

      if (adminProfiles) {
        adminProfilesMap = adminProfiles.reduce((acc, p) => {
          acc[p.id] = p;
          return acc;
        }, {});
      }
    }

    const assignmentStats = (assignmentData || []).reduce((acc, conv) => {
      const adminId = conv.assigned_to;
      if (adminId) {
        const adminName = adminProfilesMap[adminId]?.name || 'Unknown';
        if (!acc[adminId]) {
          acc[adminId] = { admin_id: adminId, admin_name: adminName, assigned_count: 0 };
        }
        acc[adminId].assigned_count++;
      }
      return acc;
    }, {} as Record<string, { admin_id: string; admin_name: string; assigned_count: number }>);

    // Calculate average response time and resolution time
    // This is a simplified version - you may need to adjust based on your data structure
    const averageResponseTime = 0; // TODO: Calculate from message timestamps
    const averageResolutionTime = 0; // TODO: Calculate from conversation timestamps

    return {
      total_conversations: totalConversations,
      total_messages: totalMessages,
      average_response_time: averageResponseTime,
      average_resolution_time: averageResolutionTime,
      conversations_by_day: conversationsByDay,
      messages_by_day: messagesByDay,
      priority_breakdown: Object.entries(priorityBreakdown).map(([priority, count]) => ({
        priority: priority as any,
        count,
      })),
      assignment_stats: Object.values(assignmentStats),
    };
  } catch (error) {
    console.error('Error getting support metrics:', error);
    throw error;
  }
};

export const getAdminPerformance = async (
  startDate?: string,
  endDate?: string
): Promise<AdminPerformance[]> => {
  try {
    // Get all admins
    const { data: admins } = await supabase
      .from('profiles')
      .select('id, name, email')
      .eq('role', 'admin');

    if (!admins) return [];

    // Get performance for each admin
    const performance = await Promise.all(
      admins.map(async (admin) => {
        let conversationsQuery = supabase
          .from('conversations')
          .select('*', { count: 'exact' })
          .eq('assigned_to', admin.id);

        let messagesQuery = supabase
          .from('messages')
          .select('*', { count: 'exact' })
          .eq('sender_id', admin.id)
          .eq('sender_role', 'admin');

        if (startDate) {
          conversationsQuery = conversationsQuery.gte('created_at', startDate);
          messagesQuery = messagesQuery.gte('created_at', startDate);
        }
        if (endDate) {
          conversationsQuery = conversationsQuery.lte('created_at', endDate);
          messagesQuery = messagesQuery.lte('created_at', endDate);
        }

        const [conversationsResult, messagesResult] = await Promise.all([
          conversationsQuery,
          messagesQuery,
        ]);

        return {
          admin_id: admin.id,
          admin_name: admin.name || admin.email,
          admin_email: admin.email,
          conversations_handled: conversationsResult.count || 0,
          average_response_time: 0, // TODO: Calculate
          average_resolution_time: 0, // TODO: Calculate
          messages_sent: messagesResult.count || 0,
        };
      })
    );

    return performance;
  } catch (error) {
    console.error('Error getting admin performance:', error);
    throw error;
  }
};

// Helper function to group data by day
function groupByDay(data: any[], dateField: string): Array<{ date: string; count: number }> {
  const grouped = data.reduce((acc, item) => {
    const date = new Date(item[dateField]).toISOString().split('T')[0];
    acc[date] = (acc[date] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return Object.entries(grouped).map(([date, count]) => ({ date, count }));
}

