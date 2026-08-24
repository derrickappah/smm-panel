/**
 * Claim Reward Endpoint
 * 
 * Processes a reward claim submission after verifying eligibility.
 * Stores the user's personal link and records the claim in the database.
 * 
 * Route: POST /api/reward/claim-reward
 */

import { verifyAuth, getServiceRoleClient } from '../utils/auth.js';
import { setCorsHeaders } from '../utils/corsHeaders.js';

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
        // Authenticate user via standardized helper
        let user;
        try {
            const authResult = await verifyAuth(req);
            user = authResult.user;
        } catch (authError) {
            return res.status(401).json({
                error: 'Authentication required',
                message: authError.message
            });
        }

        // Get and validate request body
        const { link, reward_type = 'likes' } = req.body;

        if (!link || typeof link !== 'string' || !link.trim()) {
            return res.status(400).json({ error: 'Link is required' });
        }

        if (!['likes', 'views'].includes(reward_type)) {
            return res.status(400).json({ error: 'Invalid reward type. Must be either "likes" or "views".' });
        }

        // Basic URL validation
        const trimmedLink = link.trim();
        const urlPattern = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/i;

        if (!urlPattern.test(trimmedLink)) {
            return res.status(400).json({ error: 'Invalid link format. Please provide a valid URL.' });
        }

        // Get today's date (server-side, UTC)
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

        // Service role client for database operations (table mutation revoked from unprivileged JWTs in Migration 254)
        const supabase = getServiceRoleClient();

        // RE-CHECK ELIGIBILITY (never trust frontend)
        // 1. Fetch current reward settings
        const { data: settings, error: settingsError } = await supabase
            .from('reward_settings')
            .select('daily_deposit_limit, likes_amount, views_amount')
            .single();

        if (settingsError || !settings) {
            console.error('Error fetching reward settings:', settingsError);
            return res.status(500).json({
                error: 'Failed to fetch reward settings',
                details: settingsError?.message
            });
        }

        const requiredDeposit = parseFloat(settings.daily_deposit_limit);
        const rewardAmount = reward_type === 'likes' ? settings.likes_amount : settings.views_amount;

        // 2. Calculate today's total approved deposits
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

        // 3. Check if user already claimed today
        const { data: existingClaim, error: claimCheckError } = await supabase
            .from('daily_reward_claims')
            .select('id')
            .eq('user_id', user.id)
            .eq('claim_date', today)
            .maybeSingle();

        if (claimCheckError) {
            console.error('Error checking existing claim:', claimCheckError);
            return res.status(500).json({
                error: 'Failed to check claim status',
                details: claimCheckError.message
            });
        }

        if (existingClaim) {
            return res.status(400).json({
                error: 'You have already claimed today\'s reward',
                status: 'claimed'
            });
        }

        // 4. Verify deposit amount meets requirement
        if (totalDeposits < requiredDeposit) {
            return res.status(400).json({
                error: `Insufficient deposits. You need GHS ${requiredDeposit.toFixed(2)}, but have deposited GHS ${totalDeposits.toFixed(2)} today.`,
                status: 'not_eligible',
                data: {
                    required: requiredDeposit,
                    current: totalDeposits
                }
            });
        }

        // All checks passed - insert claim record
        const { data: claimData, error: insertError } = await supabase
            .from('daily_reward_claims')
            .insert({
                user_id: user.id,
                deposit_total: totalDeposits,
                link: trimmedLink,
                claim_date: today,
                reward_type: reward_type,
                reward_amount: rewardAmount
            })
            .select()
            .single();

        if (insertError) {
            // Check if it's a unique constraint violation
            if (insertError.code === '23505' || insertError.message?.includes('duplicate') || insertError.message?.includes('unique')) {
                return res.status(400).json({
                    error: 'You have already claimed today\'s reward',
                    status: 'claimed'
                });
            }

            console.error('Error inserting claim:', insertError);
            return res.status(500).json({
                error: 'Failed to process claim',
                details: insertError.message
            });
        }

        // Success!
        return res.status(200).json({
            success: true,
            message: `Reward claimed successfully! 🎉 You received ${rewardAmount} ${reward_type}.`,
            data: {
                claim_id: claimData.id,
                deposit_total: totalDeposits,
                claim_date: today,
                reward_type: reward_type,
                reward_amount: rewardAmount
            }
        });

    } catch (error) {
        console.error('Error in claim-reward:', error);
        return res.status(500).json({
            error: 'Internal server error while claiming reward'
        });
    }
}
