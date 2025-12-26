import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSupport } from '@/contexts/support-context';
import { toast } from 'sonner';
import type { TicketCategory } from '@/types/support';

export const TicketForm: React.FC = () => {
  const { createTicket } = useSupport();
  const [category, setCategory] = useState<TicketCategory | ''>('');
  const [subcategory, setSubcategory] = useState<string>('');
  const [orderId, setOrderId] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!category) {
      toast.error('Please select a category');
      return;
    }

    if (!message.trim()) {
      toast.error('Please enter a message');
      return;
    }

    setIsSubmitting(true);
    try {
      const ticket = await createTicket(
        category as TicketCategory,
        orderId.trim() || null,
        message.trim(),
        subcategory.trim() || null
      );

      if (ticket) {
        toast.success('Ticket created successfully');
        // Reset form
        setCategory('');
        setSubcategory('');
        setOrderId('');
        setMessage('');
      } else {
        toast.error('Failed to create ticket');
      }
    } catch (error: any) {
      console.error('Error creating ticket:', error);
      toast.error(error.message || 'Failed to create ticket');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-6">
      <div className="space-y-2">
        <Label htmlFor="category">Category</Label>
        <Select value={category} onValueChange={(value) => setCategory(value as TicketCategory)}>
          <SelectTrigger id="category" className="w-full">
            <SelectValue placeholder="Select a category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Refill">Refill</SelectItem>
            <SelectItem value="Cancel">Cancel</SelectItem>
            <SelectItem value="Speed Up">Speed Up</SelectItem>
            <SelectItem value="Restart">Restart</SelectItem>
            <SelectItem value="Fake Complete">Fake Complete</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="subcategory">Subcategory</Label>
        <Select value={subcategory} onValueChange={setSubcategory}>
          <SelectTrigger id="subcategory" className="w-full">
            <SelectValue placeholder="Select a subcategory (optional)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">None</SelectItem>
            <SelectItem value="Refill">Refill</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="orderId">Order ID</Label>
        <Input
          id="orderId"
          type="text"
          placeholder="example: 10867110,10867210,10867500"
          value={orderId}
          onChange={(e) => setOrderId(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="message">Message</Label>
        <Textarea
          id="message"
          placeholder="Describe your issue..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={6}
          className="resize-none"
        />
      </div>

      <Button
        type="submit"
        disabled={isSubmitting || !category || !message.trim()}
        className="w-full bg-purple-600 hover:bg-purple-700 text-white"
      >
        {isSubmitting ? 'Submitting...' : 'Submit ticket'}
      </Button>
    </form>
  );
};

