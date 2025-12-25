import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, Plus } from 'lucide-react';
import { useSupport } from '@/contexts/support-context';
import { formatDistanceToNow } from 'date-fns';
import type { AdminNote } from '@/types/support';

interface AdminNotesProps {
  conversationId: string;
}

export const AdminNotes: React.FC<AdminNotesProps> = ({ conversationId }) => {
  const { getAdminNotes, addAdminNote } = useSupport();
  const [notes, setNotes] = useState<AdminNote[]>([]);
  const [newNote, setNewNote] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadNotes();
  }, [conversationId]);

  const loadNotes = async () => {
    setLoading(true);
    try {
      const fetchedNotes = await getAdminNotes(conversationId);
      setNotes(fetchedNotes);
    } catch (error) {
      console.error('Error loading notes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) return;

    try {
      await addAdminNote(conversationId, newNote);
      setNewNote('');
      await loadNotes();
    } catch (error) {
      console.error('Error adding note:', error);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="w-5 h-5" />
          Admin Notes
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add new note */}
        <div className="space-y-2">
          <Textarea
            placeholder="Add internal note (not visible to user)..."
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            rows={3}
          />
          <Button onClick={handleAddNote} size="sm">
            <Plus className="w-4 h-4 mr-2" />
            Add Note
          </Button>
        </div>

        {/* Notes list */}
        {loading ? (
          <p className="text-sm text-gray-500">Loading notes...</p>
        ) : notes.length === 0 ? (
          <p className="text-sm text-gray-500">No notes yet</p>
        ) : (
          <div className="space-y-3">
            {notes.map((note) => (
              <div key={note.id} className="border rounded-lg p-3 bg-gray-50">
                <p className="text-sm whitespace-pre-wrap">{note.note}</p>
                <p className="text-xs text-gray-500 mt-2">
                  {formatDistanceToNow(new Date(note.created_at), { addSuffix: true })}
                  {note.updated_at !== note.created_at && ' (edited)'}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

