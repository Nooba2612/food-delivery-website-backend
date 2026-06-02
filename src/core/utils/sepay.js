const crypto = require('crypto');
const AppError = require('@core/utils/AppError');

const getSePayConfig = () => {
    const { SEPAY_WEBHOOK_SECRET, SEPAY_WEBHOOK_TOKEN } = process.env;
    return {
        webhookSecret: SEPAY_WEBHOOK_SECRET,
        webhookToken: SEPAY_WEBHOOK_TOKEN,
    };
};

const verifySePayWebhook = ({ rawBody, signature, token, secret }) => {
    if (!secret && !token) {
        return { ok: true, skipped: true };
    }

    if (token) {
        if (!signature) {
            throw new AppError('Thiếu token SePay', 401);
        }
        if (signature !== token) {
            throw new AppError('Token SePay không hợp lệ', 401);
        }
        return { ok: true, skipped: false };
    }

    if (!signature) {
        throw new AppError('Thiếu chữ ký SePay', 401);
    }

    const computed = crypto
        .createHmac('sha256', secret)
        .update(rawBody)
        .digest('hex');

    if (computed !== signature) {
        throw new AppError('Chữ ký SePay không hợp lệ', 401);
    }

    return { ok: true, skipped: false };
};

module.exports = {
    getSePayConfig,
    verifySePayWebhook,
};
