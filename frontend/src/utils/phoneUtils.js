/**
 * Phone Number Normalization Utility
 * Normalizes phone numbers for consistent storage and comparison
 */

/**
 * Normalizes a phone number by removing spaces, dashes, parentheses, and other non-digit characters
 * @param {string} phone - The phone number to normalize
 * @returns {string} - Normalized phone number (digits only)
 */
export function normalizePhoneNumber(phone) {
  if (!phone || typeof phone !== 'string') {
    return '';
  }
  
  // Remove all non-digit characters (spaces, dashes, parentheses, plus signs, etc.)
  return phone.replace(/\D/g, '');
}

/**
 * Validates if a phone number is in a valid format
 * @param {string} phone - The phone number to validate
 * @returns {boolean} - True if the phone number appears valid
 */
export function isValidPhoneNumber(phone) {
  const normalized = normalizePhoneNumber(phone);
  // Ghana phone numbers are typically 10 digits (starting with 0) or 9 digits (without leading 0)
  // This is a basic validation - adjust based on your requirements
  return normalized.length >= 9 && normalized.length <= 10;
}
