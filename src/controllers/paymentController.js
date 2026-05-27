const paymentService = require('@modules/User/paymentService');
const catchAsync = require('@core/utils/catchAsync');
const AppError = require('@core/utils/AppError');
const {
    reserveIdempotencyKey,
    completeIdempotencyKey,
    releaseIdempotencyKey,
} = require('@core/utils/idempotencyStore');

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
}

module.exports = new paymentController();
