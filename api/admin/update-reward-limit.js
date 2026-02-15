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
        const { daily_deposit_limit } = req.body;

        if (daily_deposit_limit === undefined || daily_deposit_limit === null) {
            return res.status(400).json({ error: 'daily_deposit_limit is required' });
        }

        const newLimit = parseFloat(daily_deposit_limit);

        // Validate amount
        if (isNaN(newLimit) || newLimit < 1 || newLimit > 10000) {
            return res.status(400).json({
                error: 'Invalid deposit limit. Must be between GHS 1 and GHS 10,000.'
            });
        }

        // Fetch current settings to get old value
        const { data: currentSettings, error: fetchError } = await supabase
            .from('reward_settings')
            .select('daily_deposit_limit')
            .single();

        if (fetchError) {
            console.error('Error fetching current settings:', fetchError);
            return res.status(500).json({
                error: 'Failed to fetch current settings',
                details: fetchError.message
            });
        }

        const oldLimit = parseFloat(currentSettings.daily_deposit_limit);

        // Check if value actually changed
        if (oldLimit === newLimit) {
            return res.status(200).json({
                success: true,
                message: 'No change needed - value is already set to this amount',
                data: {
                    daily_deposit_limit: newLimit
                }
            });
        }

        // Update reward_settings
        const { data: updatedSettings, error: updateError } = await supabase
            .from('reward_settings')
            .update({
                daily_deposit_limit: newLimit,
                updated_by: user.id,
                updated_at: new Date().toISOString()
            })
            .eq('id', currentSettings.id || '00000000-0000-0000-0000-000000000000') // Use actual ID or fallback
            .select()
            .single();

        if (updateError) {
            console.error('Error updating settings:', updateError);
            return res.status(500).json({
                error: 'Failed to update settings',
                details: updateError.message
            });
        }

        // Log the change to audit trail
        const { error: logError } = await supabase
            .from('reward_setting_logs')
            .insert({
                admin_id: user.id,
                old_value: oldLimit,
                new_value: newLimit
            });

        if (logError) {
            console.error('Error logging change:', logError);
            // Don't fail the request if logging fails, but log the error
        }

        // Success!
        return res.status(200).json({
            success: true,
            message: `Deposit limit updated from GHS ${oldLimit.toFixed(2)} to GHS ${newLimit.toFixed(2)}`,
            data: {
                old_value: oldLimit,
                new_value: newLimit,
                updated_by: user.id,
                updated_at: updatedSettings.updated_at
            }
        });

    } catch (error) {
        console.error('Error in update-reward-limit:', error);
        return res.status(500).json({
            error: 'Internal server error',
            details: error.message
        });
    }
}
