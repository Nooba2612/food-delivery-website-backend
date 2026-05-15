/**
 * Normalizes a phone number to E.164 format (+84XXXXXXXXX)
 * Rules:
 * - Always returns +84 prefix
 * - Idempotent: safe to call multiple times
 * - Input can be 9-digit, 10-digit, or already formatted
 * @param {string} phone - The phone number to format
 * @returns {string} - Formatted E.164 phone number
 */
const formatPhoneNumber = (phone) => {
    if (!phone) return "";
    
    // Remove all non-digit characters
    const cleaned = phone.toString().replace(/\D/g, "");
    
    // If it starts with 84, it's likely already got the country code (without +)
    // If it starts with 0, it's a local number
    // We want the last 9 digits for Vietnamese numbers
    const digits = cleaned.length > 9 ? cleaned.slice(-9) : cleaned;
    
    const formatted = "+84" + digits;

    // Use a simpler log to avoid confusion, or keep it descriptive
    // console.log(`[PHONE FORMAT] ${phone} -> ${formatted}`);

    return formatted;
};

/**
 * Returns just the 9 raw digits for database storage/lookup
 * @param {string} phone - Any phone format
 * @returns {string} - 9 digits
 */
const getPhoneDigits = (phone) => {
    if (!phone) return "";
    const cleaned = phone.toString().replace(/\D/g, "");
    return cleaned.slice(-9);
};

// Maintain normalizePhone as an alias for compatibility if needed, 
// but pointing to the new idempotent logic
const normalizePhone = formatPhoneNumber;

module.exports = { 
    formatPhoneNumber, 
    normalizePhone, 
    getPhoneDigits 
};
