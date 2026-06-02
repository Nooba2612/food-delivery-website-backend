const paymentService = require('@modules/User/paymentService');
const catchAsync = require('@core/utils/catchAsync');
const AppError = require('@core/utils/AppError');
const {
    reserveIdempotencyKey,
    completeIdempotencyKey,
    releaseIdempotencyKey,
} = require('@core/utils/idempotencyStore');
const { verifySePayWebhook, getSePayConfig } = require('@core/utils/sepay');

class paymentController {
    /**
     * POST /api/payments
     * Create pending payment session from cart (bank transfer)
     */
    createPaymentSession = catchAsync(async (req, res, next) => {
        if (!req.user || !req.user.user_id) {
            return next(
                new AppError('Bạn cần đăng nhập để thực hiện thanh toán', 401),
            );
        }

        const userId = req.user.user_id;
        const { address_id, note, voucher_code, request_id } = req.body;

        if (!address_id) {
            return next(
                new AppError('Vui lòng cung cấp địa chỉ giao hàng', 400),
            );
        }

        const idempotencyState = await reserveIdempotencyKey({
            scope: 'checkout-payment',
            userId,
            requestId: request_id,
            payload: {
                address_id,
                note,
                voucher_code,
            },
        });

        if (idempotencyState.status === 'conflict') {
            return next(
                new AppError(
                    'Yêu cầu thanh toán không hợp lệ do request_id bị tái sử dụng cho dữ liệu khác',
                    409,
                ),
            );
        }

        if (idempotencyState.status === 'in_progress') {
            return next(
                new AppError(
                    'Phiên thanh toán đang được tạo. Vui lòng chờ trong giây lát',
                    409,
                ),
            );
        }

        if (idempotencyState.status === 'replay') {
            return res.status(200).json({
                success: true,
                data: idempotencyState.response,
                idempotent_replay: true,
            });
        }

        try {
            const paymentSession =
                await paymentService.createPendingPaymentFromCart(userId, {
                    address_id,
                    note,
                    voucher_code,
                });

            await completeIdempotencyKey(
                idempotencyState.storeKey,
                paymentSession,
            );

            res.status(201).json({
                success: true,
                data: paymentSession,
            });
        } catch (error) {
            await releaseIdempotencyKey(idempotencyState.storeKey);
            throw error;
        }
    });

    /**
     * POST /api/payments/:id/confirm
     * Confirm payment and create order
     */
    confirmPayment = catchAsync(async (req, res) => {
        const paymentId = req.params.id;
        const result = await paymentService.confirmPendingPayment(paymentId);

        res.status(200).json({
            success: true,
            data: result,
        });
    });

    /**
     * GET /api/payments/:id/status
     * Check payment status for current user
     */
    getPaymentStatus = catchAsync(async (req, res) => {
        const paymentId = req.params.id;
        const userId = req.user?.user_id;

        if (!userId) {
            throw new AppError('Bạn cần đăng nhập để kiểm tra thanh toán', 401);
        }

        const result = await paymentService.getPaymentStatus(paymentId, userId);

        res.set({
            'Cache-Control':
                'no-store, no-cache, must-revalidate, proxy-revalidate',
            Pragma: 'no-cache',
            Expires: '0',
        });

        res.status(200).json({
            success: true,
            data: result,
        });
    });

    /**
     * GET /api/payments/pending
     * List pending payments (admin)
     */
    getPendingPayments = catchAsync(async (req, res) => {
        const { status = 'pending', page = 1, limit = 20 } = req.query;
        const result = await paymentService.listPendingPayments({
            status,
            page,
            limit,
        });

        res.status(200).json({
            success: true,
            data: result,
        });
    });

    /**
     * POST /api/sepay/webhook
     * SePay webhook handler
     */
    sepayWebhook = catchAsync(async (req, res) => {
        console.log('[SePay webhook] received', {
            headers: {
                authorization: req.get('authorization'),
                xSePayToken: req.get('x-sepay-token'),
                xSePaySignature: req.get('x-sepay-signature'),
            },
            body: req.body,
        });

        const extractApiKey = (value) => {
            if (!value) return null;
            const trimmed = String(value).trim();
            const lower = trimmed.toLowerCase();
            if (lower.startsWith('apikey ')) {
                return trimmed.slice(7).trim();
            }
            if (lower.startsWith('bearer ')) {
                return trimmed.slice(7).trim();
            }
            return trimmed;
        };

        const authorizationHeader = req.get('authorization');
        const authorizationToken = extractApiKey(authorizationHeader);
        const signatureHeader =
            req.get('x-sepay-signature') ||
            req.get('x-signature') ||
            req.get('signature') ||
            authorizationToken;
        const tokenHeader =
            req.get('x-sepay-token') ||
            req.get('x-token') ||
            authorizationToken;
        const config = getSePayConfig();

        verifySePayWebhook({
            rawBody: req.rawBody || Buffer.from(JSON.stringify(req.body || {})),
            signature: signatureHeader || tokenHeader,
            token: config.webhookToken,
            secret: config.webhookSecret,
        });

        const payload = req.body || {};
        const data = payload.data || payload;
        const amount =
            data.transferAmount ||
            data.amountIn ||
            data.amount_in ||
            data.amount ||
            data.money ||
            data.price ||
            data.totalAmount ||
            data.total_amount;
        const description =
            data.description ||
            data.content ||
            data.transactionContent ||
            data.transferContent ||
            data.note ||
            data.add_info ||
            data.addInfo ||
            data.code ||
            data.referenceCode ||
            data.reference_code ||
            data.reference;

        const result = await paymentService.confirmSePayWebhook({
            amount,
            description,
            payload: data,
        });

        res.status(200).json({
            success: true,
            data: result,
        });
    });
}

module.exports = new paymentController();
