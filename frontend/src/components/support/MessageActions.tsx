import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreVertical, Edit, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface MessageActionsProps {
  messageId: string;
  content: string;
  onEdit: (messageId: string, newContent: string) => void;
  onDelete: (messageId: string) => void;
}

export const MessageActions: React.FC<MessageActionsProps> = ({
  messageId,
  content,
  onEdit,
  onDelete,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(content);

  const handleEdit = () => {
    if (editContent.trim() && editContent !== content) {
      onEdit(messageId, editContent);
    }
    setIsEditing(false);
  };

  const handleDelete = () => {
    if (window.confirm('Are you sure you want to delete this message?')) {
      onDelete(messageId);
    }
  };

  if (isEditing) {
    return (
      <div className="space-y-2">
        <textarea
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          className="w-full p-2 border rounded-md resize-none"
          rows={3}
          autoFocus
        />
        <div className="flex gap-2">
          <Button size="sm" onClick={handleEdit}>
            Save
          </Button>
          <Button size="sm" variant="outline" onClick={() => setIsEditing(false)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setIsEditing(true)}>
          <Edit className="mr-2 h-4 w-4" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleDelete} className="text-red-600">
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

