// Vercel Serverless Function to send support response emails
// Configure with your email service (Resend, SendGrid, etc.)

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { to, subject, message, ticketId, userName } = req.body;

    if (!to || !subject || !message) {
      return res.status(400).json({ 
        error: 'Missing required fields: to, subject, message' 
      });
    }

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
    //     subject: subject,
    //     html: `<p>Hello ${userName},</p><p>${message}</p><p>Ticket ID: ${ticketId}</p>`
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

