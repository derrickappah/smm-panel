/**
 * Payment Status Helpers
 * 
 * Utility functions for formatting and styling payment provider statuses
 * with user-friendly labels and appropriate colors.
 */

/**
 * Get configuration for a payment provider status
 * @param {string} status - The payment provider status (e.g., 'timeout', 'no_reference', 'success')
 * @param {string} paymentMethod - Optional payment method name for context (e.g., 'paystack', 'korapay', 'moolre')
 * @returns {Object} Configuration object with label and color classes
 */
export function getPaymentStatusConfig(status, paymentMethod = null) {
  if (!status) {
    return {
      label: 'Unknown',
      color: 'bg-gray-100 text-gray-700 border-gray-200'
    };
  }

  const statusLower = status.toLowerCase();

  switch (statusLower) {
    case 'success':
      return {
        label: 'Success',
        color: 'bg-green-100 text-green-700 border-green-200'
      };

    case 'failed':
      return {
        label: 'Failed',
        color: 'bg-red-100 text-red-700 border-red-200'
      };

    case 'abandoned':
      return {
        label: 'Abandoned',
        color: 'bg-orange-100 text-orange-700 border-orange-200'
      };

    case 'pending':
      return {
        label: 'Pending',
        color: 'bg-yellow-100 text-yellow-700 border-yellow-200'
      };

    case 'timeout':
      return {
        label: 'Timed Out',
        color: 'bg-amber-100 text-amber-700 border-amber-200'
      };

    case 'no_reference':
      return {
        label: 'No Reference',
        color: 'bg-orange-100 text-orange-700 border-orange-200'
      };

    case 'verification_failed':
      return {
        label: 'Verification Failed',
        color: 'bg-red-100 text-red-700 border-red-200'
      };

    case 'verification_error':
      return {
        label: 'Verification Error',
        color: 'bg-red-100 text-red-700 border-red-200'
      };

    default:
      // For unknown statuses, show the technical name but with gray styling
      return {
        label: status,
        color: 'bg-gray-100 text-gray-700 border-gray-200'
      };
  }
}

/**
 * Get payment status badge component props
 * Useful for creating consistent status badges across the app
 * @param {string} status - The payment provider status
 * @param {string} paymentMethod - Optional payment method name
 * @param {Object} options - Additional options
 * @param {boolean} options.showPrefix - Whether to show payment method prefix (e.g., "Paystack: Success")
 * @param {string} options.variant - Badge variant: 'default' (rounded border) or 'pill' (rounded-full)
 * @returns {Object} Props object with className and children
 */
export function getPaymentStatusBadgeProps(status, paymentMethod = null, options = {}) {
  const { showPrefix = false, variant = 'default' } = options;
  const config = getPaymentStatusConfig(status, paymentMethod);
  
  const baseClasses = variant === 'pill' 
    ? 'px-2 py-0.5 rounded-full text-xs font-medium'
    : 'px-2 py-0.5 rounded border text-xs font-medium';
  
  const label = showPrefix && paymentMethod
    ? `${paymentMethod.charAt(0).toUpperCase() + paymentMethod.slice(1)}: ${config.label}`
    : config.label;

  return {
    className: `${baseClasses} ${config.color}`,
    children: label
  };
}

