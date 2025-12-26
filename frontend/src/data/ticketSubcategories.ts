export const ticketSubcategories = {
  order: [
    'Refill',
    'Cancel',
    'Speed Up',
    'Restart',
    'Fake Complete',
    'Status Inquiry',
    'Partial Delivery',
    'Wrong Service'
  ],
  payment: [
    'Deposit Issue',
    'Payment Failed',
    'Balance Issue',
    'Transaction Error'
  ],
  account: [
    'Login Issue',
    'Password Reset',
    'Profile Update',
    'Account Verification',
    'Account Suspension'
  ],
  complaint: [
    'Service Quality',
    'Delivery Time',
    'Customer Service',
    'Billing Error',
    'Other Complaint'
  ],
  other: [
    'General Inquiry',
    'Feature Request',
    'Bug Report',
    'Technical Issue',
    'Other'
  ]
} as const;

export type TicketCategory = keyof typeof ticketSubcategories;

export function getSubcategoriesForCategory(category: TicketCategory | ''): string[] {
  if (!category || !(category in ticketSubcategories)) {
    return [];
  }
  return [...ticketSubcategories[category as TicketCategory]];
}

