/**
 * Status Mapping Utilities for SMM Providers
 * Shared between various API endpoints to ensure consistent status handling
 */

/**
 * Map SMMGen status to our status format
 * @param {string} smmgenStatus - Status from SMMGen API
 * @returns {string|null} Mapped status or null if unknown
 */
export const mapSMMGenStatus = (smmgenStatus) => {
    if (!smmgenStatus) return null;

    const statusString = String(smmgenStatus).trim();
    const statusLower = statusString.toLowerCase();

    if (statusLower === 'pending' || statusLower.includes('pending')) return 'pending';
    if (statusLower === 'in progress' || statusLower.includes('in progress')) return 'in progress';
    if (statusLower === 'completed' || statusLower.includes('completed')) return 'completed';
    if (statusLower === 'partial' || statusLower.includes('partial')) return 'partial';
    if (statusLower === 'processing' || statusLower.includes('processing')) return 'processing';
    if (statusLower === 'canceled' || statusLower === 'cancelled' || statusLower.includes('cancel')) return 'canceled';
    if (statusLower === 'refunds' || statusLower.includes('refund')) return 'refunds';

    return null;
};

/**
 * Map SMMCost status to our status format (same mapping as SMMGen)
 * @param {string} smmcostStatus - Status from SMMCost API
 * @returns {string|null} Mapped status or null if unknown
 */
export const mapSMMCostStatus = (smmcostStatus) => {
    if (!smmcostStatus) return null;

    const statusString = String(smmcostStatus).trim();
    const statusLower = statusString.toLowerCase();

    if (statusLower === 'pending' || statusLower.includes('pending')) return 'pending';
    if (statusLower === 'in progress' || statusLower.includes('in progress')) return 'in progress';
    if (statusLower === 'completed' || statusLower.includes('completed')) return 'completed';
    if (statusLower === 'partial' || statusLower.includes('partial')) return 'partial';
    if (statusLower === 'processing' || statusLower.includes('processing')) return 'processing';
    if (statusLower === 'canceled' || statusLower === 'cancelled' || statusLower.includes('cancel')) return 'canceled';
    if (statusLower === 'refunds' || statusLower.includes('refund')) return 'refunds';

    return null;
};

/**
 * Map JB SMM Panel status to our status format
 * Handles both numeric codes and string status values
 * @param {string|number} jbsmmpanelStatus - Status from JB SMM Panel API
 * @returns {string|null} Mapped status or null if unknown
 */
export const mapJBSMMPanelStatus = (jbsmmpanelStatus) => {
    if (jbsmmpanelStatus === null || jbsmmpanelStatus === undefined) return null;

    // Handle numeric status codes first (common SMM panel format)
    if (typeof jbsmmpanelStatus === 'number') {
        const statusMap = {
            0: 'pending',
            1: 'processing',
            2: 'completed',
            3: 'partial',
            4: 'canceled',
            5: 'refunded'
        };
        if (statusMap.hasOwnProperty(jbsmmpanelStatus)) {
            return statusMap[jbsmmpanelStatus];
        }
        // If not a known numeric code, convert to string and continue
        jbsmmpanelStatus = String(jbsmmpanelStatus);
    }

    const statusString = String(jbsmmpanelStatus).trim();
    if (!statusString) return null;

    const statusLower = statusString.toLowerCase();

    // Exact matches first (most specific)
    if (statusLower === 'pending') return 'pending';
    if (statusLower === 'in progress' || statusLower === 'in-progress' || statusLower === 'inprogress') return 'in progress';
    if (statusLower === 'completed' || statusLower === 'complete') return 'completed';
    if (statusLower === 'partial') return 'partial';
    if (statusLower === 'processing' || statusLower === 'process') return 'processing';
    if (statusLower === 'canceled' || statusLower === 'cancelled' || statusLower === 'cancel') return 'canceled';
    if (statusLower === 'refunds' || statusLower === 'refunded' || statusLower === 'refund') return 'refunds';

    // Partial matches (less specific, check after exact matches)
    if (statusLower.includes('in progress') || statusLower.includes('in-progress')) return 'in progress';
    if (statusLower.includes('completed') || statusLower.includes('complete')) return 'completed';
    if (statusLower.includes('partial')) return 'partial';
    if (statusLower.includes('processing') || statusLower.includes('process')) return 'processing';
    if (statusLower.includes('cancel')) return 'canceled';
    if (statusLower.includes('refund')) return 'refunds';
    if (statusLower.includes('pending')) return 'pending';

    return null;
};

/**
 * Map World of SMM status to our status format
 * @param {string} worldofsmmStatus - Status from World of SMM API
 * @returns {string|null} Mapped status or null if unknown
 */
export const mapWorldOfSMMStatus = (worldofsmmStatus) => {
    if (!worldofsmmStatus) return null;

    const statusString = String(worldofsmmStatus).trim();
    const statusLower = statusString.toLowerCase();

    if (statusLower === 'pending' || statusLower.includes('pending')) return 'pending';
    if (statusLower === 'in progress' || statusLower.includes('in progress')) return 'in progress';
    if (statusLower === 'completed' || statusLower.includes('completed')) return 'completed';
    if (statusLower === 'partial' || statusLower.includes('partial')) return 'partial';
    if (statusLower === 'processing' || statusLower.includes('processing')) return 'processing';
    if (statusLower === 'canceled' || statusLower === 'cancelled' || statusLower.includes('cancel')) return 'canceled';
    if (statusLower === 'refunds' || statusLower.includes('refund')) return 'refunds';

    return null;
};
