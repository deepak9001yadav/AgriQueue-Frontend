/**
 * Formats a date string or Date object to DD/MM/YYYY
 * Handles YYYY-MM-DD, ISO strings, timestamps, and Date objects safely
 * without timezone shift issues.
 *
 * @param {string|Date|number} dateInput - The date to format
 * @param {string} fallback - Fallback if date is invalid or empty
 * @returns {string} Formatted date string (DD/MM/YYYY)
 */
export function formatDateDMY(dateInput, fallback = '-') {
    if (!dateInput) return fallback;

    // If it's a string, attempt exact regex match first to avoid timezone conversion bugs
    if (typeof dateInput === 'string') {
        const trimmed = dateInput.trim();
        // Match YYYY-MM-DD or YYYY/MM/DD
        const ymdMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
        if (ymdMatch) {
            const [, y, m, d] = ymdMatch;
            return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
        }
        // If already DD/MM/YYYY, return as is
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
            return trimmed;
        }
    }

    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return String(dateInput);

    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();

    return `${day}/${month}/${year}`;
}
