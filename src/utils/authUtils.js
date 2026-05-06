/**
 * Utility to normalize current user ID from request object.
 * Supports various common formats used by different auth middlewares.
 */
const getCurrentUserId = (req) => {
    return (
        req.user?.id ||
        req.user?.user_id ||
        req.user?.userId ||
        req.user?.sub ||
        null
    );
};

module.exports = {
    getCurrentUserId,
};
