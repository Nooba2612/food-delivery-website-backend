/**
 * Transform snake_case object keys to camelCase
 * @param {Object} obj - Object with snake_case keys
 * @returns {Object} Object with camelCase keys
 */
function toCamelCase(obj) {
    if (!obj || typeof obj !== "object") return obj;

    if (Array.isArray(obj)) {
        return obj.map((item) => toCamelCase(item));
    }

    const camelCaseObj = {};
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const camelKey = key.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
            const value = obj[key];

            // Recursively transform nested objects
            if (value && typeof value === "object" && !Array.isArray(value)) {
                camelCaseObj[camelKey] = toCamelCase(value);
            } else if (Array.isArray(value)) {
                camelCaseObj[camelKey] = value.map((item) =>
                    item && typeof item === "object" ? toCamelCase(item) : item,
                );
            } else {
                camelCaseObj[camelKey] = value;
            }
        }
    }
    return camelCaseObj;
}

module.exports = { toCamelCase };
