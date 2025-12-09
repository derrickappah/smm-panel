import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const UserEditForm = ({ user, onSave, onCancel }) => {
  const [formData, setFormData] = useState({
    name: user.name,
    email: user.email,
    phone_number: user.phone_number || '',
    role: user.role,
    balance: user.balance
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label className="text-sm font-medium">Name</Label>
        <Input
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
          className="h-12 text-base"
          autoComplete="name"
        />
      </div>
      <div>
        <Label className="text-sm font-medium">Email</Label>
        <Input
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          required
          className="h-12 text-base"
          autoComplete="email"
          inputMode="email"
        />
      </div>
      <div>
        <Label className="text-sm font-medium">Phone Number</Label>
        <Input
          type="tel"
          placeholder="+233 XX XXX XXXX"
          value={formData.phone_number}
          onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
          className="h-12 text-base"
          autoComplete="tel"
          inputMode="tel"
        />
      </div>
      <div>
        <Label className="text-sm font-medium">Role</Label>
        <Select value={formData.role} onValueChange={(value) => setFormData({ ...formData, role: value })}>
          <SelectTrigger className="min-h-[44px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="user">User</SelectItem>
            <SelectItem value="seller">Seller</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-sm font-medium">Balance (₵)</Label>
        <Input
          type="number"
          step="0.01"
          value={formData.balance}
          onChange={(e) => setFormData({ ...formData, balance: parseFloat(e.target.value) })}
          required
          className="h-12 text-base"
          inputMode="decimal"
        />
      </div>
      <div className="flex flex-col sm:flex-row gap-3 pt-2">
        <Button type="submit" className="flex-1 min-h-[44px] text-base">Save</Button>
        <Button type="button" variant="outline" onClick={onCancel} className="min-h-[44px] text-base">Cancel</Button>
      </div>
    </form>
  );
};

export default UserEditForm;


