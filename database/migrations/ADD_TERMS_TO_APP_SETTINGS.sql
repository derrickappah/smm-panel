-- Add Terms and Conditions to app_settings table
-- This allows admins to edit terms from the admin panel
-- Run this in Supabase SQL Editor

-- Insert default terms and conditions (can be edited from admin panel)
INSERT INTO app_settings (key, value, description) 
VALUES 
    ('terms_and_conditions', 'By accessing and using BoostUp GH ("the Service"), you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to abide by the above, please do not use this service.

BoostUp GH provides social media marketing (SMM) services including but not limited to followers, likes, views, comments, and other engagement services for various social media platforms including Instagram, TikTok, YouTube, Facebook, Twitter, WhatsApp, and Telegram.

You are responsible for maintaining the confidentiality of your account and password. You agree to accept responsibility for all activities that occur under your account or password. You must notify us immediately of any unauthorized use of your account.

All payments must be made in advance. We accept various payment methods as displayed on our platform. All prices are in the currency specified on the website. Refunds are subject to our refund policy and are not guaranteed for completed orders.

We strive to deliver services within the timeframes specified. However, delivery times are estimates and not guaranteed. We are not responsible for delays caused by third-party platforms or factors beyond our control. Partial deliveries may occur, and we will continue to fulfill orders until completion.

You agree not to use the Service for any illegal purpose or in violation of any local, state, national, or international law; to violate the terms of service of any social media platform; to spam, harass, or abuse other users; to impersonate any person or entity; or to interfere with or disrupt the Service or servers.

All content, features, and functionality of the Service are owned by BoostUp GH and are protected by international copyright, trademark, and other intellectual property laws. You may not reproduce, distribute, or create derivative works from any content without our express written permission.

BoostUp GH shall not be liable for any indirect, incidental, special, consequential, or punitive damages resulting from your use of or inability to use the Service. Our total liability shall not exceed the amount you paid for the specific service in question.

We do not guarantee that the Service will be available at all times. We reserve the right to modify, suspend, or discontinue the Service at any time without notice. We are not liable for any loss or damage resulting from Service unavailability.

Refunds may be issued for orders that have not been started or completed within a reasonable timeframe. Once an order has been started or completed, refunds are generally not available. Refund requests must be submitted through our support system and will be reviewed on a case-by-case basis.

We reserve the right to terminate or suspend your account at any time, without prior notice, for conduct that we believe violates these Terms or is harmful to other users, us, or third parties, or for any other reason.

We reserve the right to modify these Terms at any time. We will notify users of any material changes by updating the "Last Updated" date. Your continued use of the Service after such modifications constitutes acceptance of the updated Terms.

If you have any questions about these Terms, please contact us through our support system or email us at support@boostupgh.com.

These Terms shall be governed by and construed in accordance with the laws of Ghana, without regard to its conflict of law provisions. Any disputes arising from these Terms shall be subject to the exclusive jurisdiction of the courts of Ghana.', 'Terms and Conditions content that users must accept during signup')
ON CONFLICT (key) DO NOTHING;

-- Add comment
COMMENT ON COLUMN app_settings.value IS 'For terms_and_conditions key, stores the full terms content in plain text';

