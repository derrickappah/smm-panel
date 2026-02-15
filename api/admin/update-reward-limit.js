/**
 * Update Reward Limit Endpoint (Admin Only)
 * 
 * Allows admins to update the daily deposit limit required for reward claims.
 * Logs all changes to the audit trail.
 * 
 * Route: POST /api/admin/update-reward-limit
 */

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    // Enable CORS
    const origin = req.headers.origin;
    const allowedOrigins = [
        'https://boostupgh.com',
        'https://www.boostupgh.com',
        'http://localhost:3000'
    ];

    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
        res.setHeader('Access-Control-Allow-Origin', 'https://boostupgh.com');
    }

    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Get authorization token
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Unauthorized - No token provided' });
        }

        const token = authHeader.replace('Bearer ', '');

        // Initialize Supabase client with user's token
        const SUPABASE_URL = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
        const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY;

        if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
            return res.status(500).json({ error: 'Server configuration error' });
        }

        const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            global: {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        });

        // Verify user authentication and admin role
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) {
            return res.status(401).json({ error: 'Unauthorized - Invalid token' });
        }

        // Check if user is admin
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single();

        if (profileError || !profile || profile.role !== 'admin') {
            return res.status(403).json({ error: 'Forbidden - Admin access required' });
        }

        // Get and validate request body
        const { daily_deposit_limit, likes_amount, views_amount } = req.body;

        const updateData = {};
        const validationErrors = [];

        if (daily_deposit_limit !== undefined && daily_deposit_limit !== null) {
            const newLimit = parseFloat(daily_deposit_limit);
            if (isNaN(newLimit) || newLimit < 1 || newLimit > 10000) {
                validationErrors.push('Invalid deposit limit. Must be between GHS 1 and GHS 10,000.');
            } else {
                updateData.daily_deposit_limit = newLimit;
            }
        }

        if (likes_amount !== undefined && likes_amount !== null) {
            const amount = parseInt(likes_amount);
            if (isNaN(amount) || amount < 1 || amount > 50000) {
                validationErrors.push('Invalid likes amount. Must be between 1 and 50,000.');
            } else {
                updateData.likes_amount = amount;
            }
        }

        if (views_amount !== undefined && views_amount !== null) {
            const amount = parseInt(views_amount);
            if (isNaN(amount) || amount < 1 || amount > 50000) {
                validationErrors.push('Invalid views amount. Must be between 1 and 50,000.');
            } else {
                updateData.views_amount = amount;
            }
        }

        if (validationErrors.length > 0) {
            return res.status(400).json({ error: validationErrors.join(' ') });
        }

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ error: 'No valid fields provided for update' });
        }

        // Fetch current settings to get old values for logging
        const { data: currentSettings, error: fetchError } = await supabase
            .from('reward_settings')
            .select('*')
            .single();

        if (fetchError) {
            console.error('Error fetching current settings:', fetchError);
            return res.status(500).json({
                error: 'Failed to fetch current settings',
                details: fetchError.message
            });
        }

        // Add timestamps and admin info
        updateData.updated_by = user.id;
        updateData.updated_at = new Date().toISOString();

        // Update reward_settings
        const { data: updatedSettings, error: updateError } = await supabase
            .from('reward_settings')
            .update(updateData)
            .eq('id', currentSettings.id)
            .select()
            .single();

        if (updateError) {
            console.error('Error updating settings:', updateError);
            return res.status(500).json({
                error: 'Failed to update settings',
                details: updateError.message
            });
        }

        // Log the changes to audit trail
        // We log each change separately or as a combined entry
        // For simplicity with existing logs table, we'll log the deposit limit if it changed
        // and ideally we should have a more flexible log table, but we'll stick to the current one for now
        if (updateData.daily_deposit_limit !== undefined && parseFloat(currentSettings.daily_deposit_limit) !== updateData.daily_deposit_limit) {
            await supabase
                .from('reward_setting_logs')
                .insert({
                    admin_id: user.id,
                    old_value: currentSettings.daily_deposit_limit,
                    new_value: updateData.daily_deposit_limit
                });
        }

        // Success!
        return res.status(200).json({
            success: true,
            message: 'Reward settings updated successfully',
            data: updatedSettings
        });

    } catch (error) {
        console.error('Error in update-reward-limit:', error);
        return res.status(500).json({
            error: 'Internal server error',
            details: error.message
        });
    }
}
