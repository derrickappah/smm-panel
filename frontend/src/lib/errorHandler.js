/**
 * Core Error Sanitizer Utility
 * 
 * Intercepts and transforms technical error messages (PostgreSQL constraints,
 * PostgREST errors, raw HTML 500 pages, JSON syntax errors, upstream provider dumps)
 * into safe, clean, user-friendly messages for end users.
 */

// Patterns indicating a technical error that must NEVER be shown directly to users
const DB_UNIQUE_CONSTRAINT_REGEX = /duplicate key value violates unique constraint/i;
const DB_NOT_NULL_REGEX = /null value in column .* violates not-null constraint/i;
const DB_FOREIGN_KEY_REGEX = /violates foreign key constraint/i;
const DB_CHECK_CONSTRAINT_REGEX = /violates check constraint/i;
const DB_RLS_POLICY_REGEX = /violates row-level security policy/i;
const DB_PERMISSION_DENIED_REGEX = /permission denied for (schema|table|relation)/i;
const DB_RELATION_NOT_FOUND_REGEX = /relation .* does not exist/i;
const DB_POSTGREST_REGEX = /PGRST\d{3}|JSON object requested, multiple \(or no\) rows returned/i;

const HTML_SERVER_ERROR_REGEX = /<!DOCTYPE|<html|<head|<title>|500 Internal Server Error|502 Bad Gateway|504 Gateway Timeout/i;
const JSON_SYNTAX_ERROR_REGEX = /Unexpected token '<'|is not valid JSON|JSON\.parse/i;
const NETWORK_ERROR_REGEX = /Failed to fetch|NetworkError|Network request failed|net::ERR_|ECONNREFUSED|AxiosError/i;
const PROVIDER_DUMP_REGEX = /Array\s*\(\s*\[error\]\s*=>|API key invalid|provider balance low/i;
const DEV_CONFIG_LEAK_REGEX = /Paystack key is valid|Supabase is not configured/i;

/**
 * Formats and sanitizes an error into user-friendly text.
 * 
 * @param {Error|string|object} error - The error to format.
 * @param {string} [fallback='An unexpected error occurred. Please try again.'] - Fallback message if error is unknown or uninformative.
 * @returns {string} Sanitized, user-friendly error message.
 */
export function formatUserErrorMessage(error, fallback = 'An unexpected error occurred. Please try again.') {
  if (!error) return fallback;

  // Extract error string
  let rawMessage = '';
  if (typeof error === 'string') {
    rawMessage = error.trim();
  } else if (error instanceof Error) {
    rawMessage = (error.message || '').trim();
  } else if (typeof error === 'object') {
    rawMessage = (error.error || error.message || error.details || '').toString().trim();
  }

  if (!rawMessage) return fallback;

  // 1. Check for Raw Server HTML 500 / 502 / 504 dumps
  if (HTML_SERVER_ERROR_REGEX.test(rawMessage)) {
    return 'The server is temporarily unavailable. Please try again in a moment.';
  }

  // 2. Check for JSON syntax / parsing errors (e.g. when HTML is parsed as JSON)
  if (JSON_SYNTAX_ERROR_REGEX.test(rawMessage)) {
    return 'Received an invalid response from the server. Please try again shortly.';
  }

  // 3. Check for Database & PostgreSQL errors
  if (DB_UNIQUE_CONSTRAINT_REGEX.test(rawMessage)) {
    return 'This record or value already exists. Please check your details or try logging in.';
  }
  if (DB_RLS_POLICY_REGEX.test(rawMessage) || DB_PERMISSION_DENIED_REGEX.test(rawMessage)) {
    return 'You do not have permission to perform this action. Please log in again.';
  }
  if (DB_NOT_NULL_REGEX.test(rawMessage)) {
    return 'Required information is missing. Please check your inputs and try again.';
  }
  if (DB_FOREIGN_KEY_REGEX.test(rawMessage) || DB_CHECK_CONSTRAINT_REGEX.test(rawMessage) || DB_RELATION_NOT_FOUND_REGEX.test(rawMessage)) {
    return 'Unable to complete your request due to a database error. Please contact support if this continues.';
  }
  if (DB_POSTGREST_REGEX.test(rawMessage)) {
    return 'The requested record could not be found or processed.';
  }

  // 4. Check for Network / Connection errors
  if (NETWORK_ERROR_REGEX.test(rawMessage)) {
    return 'Network connection problem. Please check your internet connection and try again.';
  }

  // 5. Check for Upstream Provider dumps
  if (PROVIDER_DUMP_REGEX.test(rawMessage)) {
    return 'The service provider is temporarily updating. Please try again shortly.';
  }

  // 6. Check for Developer / Config leaks
  if (DEV_CONFIG_LEAK_REGEX.test(rawMessage)) {
    return 'Service is temporarily undergoing maintenance. Please try again shortly or use another payment method.';
  }

  // 7. Supabase Auth specific error codes
  if (rawMessage === 'invalid_credentials' || rawMessage.includes('Invalid login credentials')) {
    return 'Invalid email or password. Please check your credentials.';
  }
  if (rawMessage.includes('Email not confirmed')) {
    return 'Please check your email and confirm your account before logging in.';
  }
  if (rawMessage.includes('over_email_send_rate_limit') || rawMessage.includes('rate limit exceeded')) {
    return 'Too many requests. Please wait a few minutes before trying again.';
  }
  if (rawMessage.includes('User already registered')) {
    return 'An account with this email already exists. Please try logging in.';
  }

  // 8. If the message starts with "Server error: <" or has broken HTML slice
  if (rawMessage.startsWith('Server error:') && (rawMessage.includes('<') || rawMessage.length > 80)) {
    return 'The server encountered an error processing your request. Please try again.';
  }

  // 9. If the message is reasonable, clean, and user-facing, pass it through safely
  // (Cap length to 150 chars to prevent massive dumps)
  if (rawMessage.length > 150) {
    return fallback;
  }

  return rawMessage;
}

export default formatUserErrorMessage;
