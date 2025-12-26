import React, { useState, useMemo } from 'react';
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
import { ticketSubcategories, getSubcategoriesForCategory } from '@/data/ticketSubcategories';

export const TicketForm: React.FC = () => {
  const { createTicket } = useSupport();
  const [category, setCategory] = useState<TicketCategory | ''>('');
  const [subcategory, setSubcategory] = useState<string>('none');
  const [orderId, setOrderId] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderIdError, setOrderIdError] = useState<string>('');

  // Get subcategories for selected category
  const availableSubcategories = useMemo(() => {
    return getSubcategoriesForCategory(category);
  }, [category]);

  // Validate order_id when category changes
  React.useEffect(() => {
    if (category === 'order' && !orderId.trim()) {
      setOrderIdError('Order ID is required for order-related tickets');
    } else {
      setOrderIdError('');
    }
  }, [category, orderId]);

  const handleCategoryChange = (value: string) => {
    setCategory(value as TicketCategory);
    setSubcategory('none'); // Reset subcategory when category changes
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!category) {
      toast.error('Please select a category');
      return;
    }

    // Validate order_id for order category
    if (category === 'order' && !orderId.trim()) {
      setOrderIdError('Order ID is required for order-related tickets');
      toast.error('Order ID is required for order-related tickets');
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
        subcategory === 'none' ? null : subcategory.trim() || null
      );

      if (ticket) {
        toast.success('Ticket created successfully');
        // Reset form
        setCategory('');
        setSubcategory('none');
        setOrderId('');
        setMessage('');
        setOrderIdError('');
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

  const isFormValid = category && message.trim() && (category !== 'order' || orderId.trim());

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-6">
      <div className="space-y-2">
        <Label htmlFor="category">Category</Label>
        <Select value={category} onValueChange={handleCategoryChange}>
          <SelectTrigger id="category" className="w-full">
            <SelectValue placeholder="Select a category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="order">Order</SelectItem>
            <SelectItem value="payment">Payment</SelectItem>
            <SelectItem value="account">Account</SelectItem>
            <SelectItem value="complaint">Complaint</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {category && availableSubcategories.length > 0 && (
        <div className="space-y-2">
          <Label htmlFor="subcategory">Subcategory</Label>
          <Select value={subcategory} onValueChange={(value) => setSubcategory(value === 'none' ? 'none' : value)}>
            <SelectTrigger id="subcategory" className="w-full">
              <SelectValue placeholder="Select a subcategory (optional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {availableSubcategories.map((sub) => (
                <SelectItem key={sub} value={sub}>
                  {sub}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="orderId">
          Order ID {category === 'order' && <span className="text-red-500">*</span>}
        </Label>
        <Input
          id="orderId"
          type="text"
          placeholder={category === 'order' ? 'Required: e.g., 10867110,10867210,10867500' : 'example: 10867110,10867210,10867500'}
          value={orderId}
          onChange={(e) => {
            setOrderId(e.target.value);
            if (category === 'order' && !e.target.value.trim()) {
              setOrderIdError('Order ID is required for order-related tickets');
            } else {
              setOrderIdError('');
            }
          }}
          className={orderIdError ? 'border-red-500' : ''}
        />
        {orderIdError && (
          <p className="text-sm text-red-500">{orderIdError}</p>
        )}
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
        disabled={isSubmitting || !isFormValid}
        className="w-full bg-purple-600 hover:bg-purple-700 text-white"
      >
        {isSubmitting ? 'Submitting...' : 'Submit ticket'}
      </Button>
    </form>
  );
};

