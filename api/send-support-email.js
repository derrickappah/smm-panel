// Vercel Serverless Function to send support response emails
// Configure with your email service (Resend, SendGrid, etc.)

function escapeHtml(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

import { setCorsHeaders } from './utils/corsHeaders.js';
import { verifyAdmin } from './utils/auth.js';

export default async function handler(req, res) {
  // Enable CORS
  setCorsHeaders(req, res);

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { isAdmin } = await verifyAdmin(req).catch(() => ({ isAdmin: false }));
    if (!isAdmin) {
      return res.status(403).json({ error: 'Unauthorized: Admin access required to dispatch support emails' });
    }

    const { to, subject, message, ticketId, userName } = req.body;

    if (!to || !subject || !message) {
      return res.status(400).json({ 
        error: 'Missing required fields: to, subject, message' 
      });
    }

    const safeUserName = escapeHtml(userName || 'Valued Customer');
    const safeMessage = escapeHtml(message);
    const safeTicketId = escapeHtml(ticketId || '');
    const safeSubject = escapeHtml(subject);

    // For now, we'll log the email (in production, integrate with email service)
    // You can integrate with:
    // - Resend (recommended): https://resend.com
    // - SendGrid: https://sendgrid.com
    // - AWS SES: https://aws.amazon.com/ses
    // - Supabase Edge Functions with email service

    console.log('Support response email:', {
      to,
      subject,
      message,
      ticketId,
      userName
    });

    // TODO: Integrate with your email service
    // Example with Resend:
    // const RESEND_API_KEY = process.env.RESEND_API_KEY;
    // const response = await fetch('https://api.resend.com/emails', {
    //   method: 'POST',
    //   headers: {
    //     'Authorization': `Bearer ${RESEND_API_KEY}`,
    //     'Content-Type': 'application/json'
    //   },
    //   body: JSON.stringify({
    //     from: 'support@boostupgh.com',
    //     to: to,
    //     subject: safeSubject,
    //     html: `<p>Hello ${safeUserName},</p><p>${safeMessage}</p><p>Ticket ID: ${safeTicketId}</p>`
    //   })
    // });

    // For now, return success (email will be sent when service is configured)
    return res.status(200).json({ 
      success: true,
      message: 'Email queued for sending (configure email service for actual delivery)'
    });
  } catch (error) {
    console.error('Send email error:', error);
    return res.status(500).json({ 
      error: error.message || 'Failed to send email' 
    });
  }
}

