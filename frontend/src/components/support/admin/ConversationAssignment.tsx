import React, { useState, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/lib/supabase';
import { User } from 'lucide-react';

interface ConversationAssignmentProps {
  conversationId: string;
  assignedTo: string | null;
  onAssignmentChange: (adminId: string) => void;
  disabled?: boolean;
}

interface Admin {
  id: string;
  name: string;
  email: string;
}

export const ConversationAssignment: React.FC<ConversationAssignmentProps> = ({
  conversationId,
  assignedTo,
  onAssignmentChange,
  disabled = false,
}) => {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAdmins = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, name, email')
          .eq('role', 'admin')
          .order('name');

        if (error) throw error;
        setAdmins(data || []);
      } catch (error) {
        console.error('Error fetching admins:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAdmins();
  }, []);

  return (
    <Select
      value={assignedTo || 'unassigned'}
      onValueChange={(value) => {
        if (value !== 'unassigned') {
          onAssignmentChange(value);
        }
      }}
      disabled={disabled || loading}
    >
      <SelectTrigger className="w-48">
        <div className="flex items-center gap-2">
          <User className="w-4 h-4" />
          <SelectValue placeholder="Assign to..." />
        </div>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="unassigned">Unassigned</SelectItem>
        {admins.map((admin) => (
          <SelectItem key={admin.id} value={admin.id}>
            {admin.name || admin.email}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

