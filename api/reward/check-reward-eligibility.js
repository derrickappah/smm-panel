/**
 * Check Reward Eligibility Endpoint
 * 
 * Checks if the authenticated user is eligible to claim today's reward
 * based on their deposit history and claim status.
 * 
 * Route: POST /api/reward/check-reward-eligibility
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

        // Verify user authentication
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) {
            return res.status(401).json({ error: 'Unauthorized - Invalid token' });
        }

        // Get today's date (server-side, UTC)
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

        // Fetch current deposit limit from reward_settings
        const { data: settings, error: settingsError } = await supabase
            .from('reward_settings')
            .select('daily_deposit_limit')
            .single();

        if (settingsError || !settings) {
            console.error('Error fetching reward settings:', settingsError);
            return res.status(500).json({
                error: 'Failed to fetch reward settings',
                details: settingsError?.message
            });
        }

        const requiredDeposit = parseFloat(settings.daily_deposit_limit);

        // Calculate today's total approved deposits
        const { data: deposits, error: depositsError } = await supabase
            .from('transactions')
            .select('amount')
            .eq('user_id', user.id)
            .eq('type', 'deposit')
            .eq('status', 'approved')
            .gte('created_at', `${today}T00:00:00Z`)
            .lte('created_at', `${today}T23:59:59Z`);

        if (depositsError) {
            console.error('Error fetching deposits:', depositsError);
            return res.status(500).json({
                error: 'Failed to fetch deposit history',
                details: depositsError.message
            });
        }

        const totalDeposits = deposits?.reduce((sum, d) => sum + parseFloat(d.amount), 0) || 0;

        // Check if user already claimed today
        const { data: existingClaim, error: claimError } = await supabase
            .from('daily_reward_claims')
            .select('id')
            .eq('user_id', user.id)
            .eq('claim_date', today)
            .maybeSingle();

        if (claimError) {
            console.error('Error checking existing claim:', claimError);
            return res.status(500).json({
                error: 'Failed to check claim status',
                details: claimError.message
            });
        }

        // Determine eligibility status
        if (existingClaim) {
            return res.status(200).json({
                status: 'claimed',
                message: "You've already claimed today's reward. Come back tomorrow!",
                data: {
                    required: requiredDeposit,
                    current: totalDeposits,
                    claimed: true
                }
            });
        }

        if (totalDeposits >= requiredDeposit) {
            return res.status(200).json({
                status: 'eligible',
                message: "You're eligible for today's reward!",
                data: {
                    required: requiredDeposit,
                    current: totalDeposits,
                    claimed: false
                }
            });
        }

        // Not eligible
        return res.status(200).json({
            status: 'not_eligible',
            message: `Deposit at least GHS ${requiredDeposit.toFixed(2)} today to claim this reward.`,
            data: {
                required: requiredDeposit,
                current: totalDeposits,
                claimed: false
            }
        });

    } catch (error) {
        console.error('Error in check-reward-eligibility:', error);
        return res.status(500).json({
            error: 'Internal server error',
            details: error.message
        });
    }
}
