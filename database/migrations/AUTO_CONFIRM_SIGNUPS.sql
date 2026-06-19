-- Migration: Auto-Confirm Signups to Bypass SMTP Rate Limits
-- Modifies the block_anonymous_signup() trigger function (which runs BEFORE INSERT on auth.users)
-- to auto-populate email_confirmed_at and confirmed_at. This prevents Supabase Auth from sending
-- confirmation emails, bypassing the default SMTP rate limit (3 emails/hour per project).

CREATE OR REPLACE FUNCTION public.block_anonymous_signup()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- Block explicit anonymous sign-ins (Supabase feature)
    IF (NEW.is_anonymous = true) THEN
        RAISE EXCEPTION 'Security Violation: Anonymous sign-ins are disabled.';
    END IF;

    -- Auto-confirm email to bypass SMTP rate limits and email verification blocks
    NEW.email_confirmed_at := COALESCE(NEW.email_confirmed_at, NOW());
    NEW.confirmed_at := COALESCE(NEW.confirmed_at, NOW());

    RETURN NEW;
END;
$function$;
