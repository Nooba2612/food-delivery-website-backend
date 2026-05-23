const paymentService = require('@services/paymentService');
const catchAsync = require('@utils/catchAsync');
const AppError = require('@utils/AppError');

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
        const { address_id, note, voucher_code } = req.body;

        if (!address_id) {
            return next(
                new AppError('Vui lòng cung cấp địa chỉ giao hàng', 400),
            );
        }

        const paymentSession =
            await paymentService.createPendingPaymentFromCart(userId, {
                address_id,
                note,
                voucher_code,
            });

        res.status(201).json({
            success: true,
            data: paymentSession,
        });
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
