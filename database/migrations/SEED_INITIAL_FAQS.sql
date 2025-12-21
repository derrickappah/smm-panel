-- Seed Initial FAQs
-- Run this in your Supabase SQL Editor after creating the faqs table
-- This migrates the hardcoded FAQs from the frontend to the database

-- Note: Replace 'YOUR_ADMIN_USER_ID' with an actual admin user ID if you want to set created_by
-- Otherwise, created_by will be NULL

INSERT INTO faqs (question, answer, "order", published) VALUES
(
  'Is this service safe for my account?',
  'Yes, absolutely! We use only safe, organic methods that comply with platform guidelines. Your account security is our top priority, and we''ve never had any issues with account bans or restrictions.',
  1,
  TRUE
),
(
  'How fast is the delivery?',
  'Most orders start within minutes of payment confirmation. The speed depends on the service type and quantity ordered. Smaller orders (under 1,000) typically complete within 24-48 hours, while larger orders may take a few days to ensure quality delivery.',
  2,
  TRUE
),
(
  'What payment methods do you accept?',
  'We accept multiple secure payment methods including Paystack (credit/debit cards), Korapay, Hubtel, and manual bank deposits. All payments are processed securely and your account balance is updated instantly upon verification.',
  3,
  TRUE
),
(
  'Are the followers/likes/views real?',
  'We provide high-quality engagement from real, active accounts. While we can''t guarantee 100% retention (as some accounts may become inactive over time), we use premium services that deliver authentic engagement from genuine users.',
  4,
  TRUE
),
(
  'Can I get a refund if I''m not satisfied?',
  'Yes! We offer a money-back guarantee. If you''re not satisfied with our service, contact our support team within 7 days of your order, and we''ll work with you to resolve the issue or provide a full refund.',
  5,
  TRUE
),
(
  'Do you offer support if I have questions?',
  'Absolutely! We have a dedicated 24/7 support team ready to help you with any questions or concerns. You can reach us through the support section in your dashboard, and we typically respond within a few hours.',
  6,
  TRUE
),
(
  'Can I order services for multiple platforms?',
  'Yes! You can order services for Instagram, TikTok, YouTube, Facebook, Twitter, and more. Simply add multiple services to your cart and checkout once. All orders are processed independently and efficiently.',
  7,
  TRUE
),
(
  'Why are my likes reducing?',
  'When you buy likes, TikTok sometimes reduces them after a few days — especially around the 6th day. This is TikTok''s automated system detecting and removing engagement it considers suspicious.

⭐ Solution 1: Delete and Restore Method
A simple trick to avoid this loss is to delete the video and restore it after a few minutes or hours. This refreshes the video and helps keep your purchased likes safe.

How to Restore a Deleted TikTok Video:
1. Open TikTok
2. Go to Your Profile (bottom right)
3. Tap the three lines (☰) in the top-right
4. Tap Settings and Privacy
5. Go to Activity Center
6. Tap Recently Deleted
7. Find your video
8. Tap it, then tap Restore

⭐ Solution 2: Hide Video Method
If you bought 1,000 likes on Monday, wait until Friday evening or Saturday morning and then hide the video. Keep it hidden for 48 hours (until Monday), and then make the video visible again. By doing this, the likes will stay permanently.

⚠ Disclaimer: Even if you buy likes, views, or comments without a refill policy, there is still a way to prevent them from dropping. Most drops usually happen about one week after purchasing, and we have methods to avoid that.',
  8,
  TRUE
),
(
  'What Is a Refill Policy?',
  'A refill policy means that if your order (likes, views, or comments) drops after some time, the site will automatically replace them for you at no extra cost.

So when you''re buying likes, views, or comments, always check whether the service has:
• Refill Policy ➜ They will replace any drops
• No Refill ➜ They won''t restore anything if the numbers go down

⚠ Disclaimer: Even if you buy likes, views, or comments without a refill policy, there is still a way to prevent them from dropping. Most drops usually happen about one week after purchasing, and we have methods to avoid that.',
  9,
  TRUE
)
ON CONFLICT DO NOTHING;

