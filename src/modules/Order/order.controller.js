const orderService = require('./order.service');
const catchAsync = require('@core/utils/catchAsync');
const AppError = require('@core/utils/AppError');
const {
    reserveIdempotencyKey,
    completeIdempotencyKey,
    releaseIdempotencyKey,
} = require('@core/utils/idempotencyStore');

class orderController {
    /**
     * POST /api/orders
     * Create order from the current user's cart (COD Only)
     */
    createOrderFromCart = catchAsync(async (req, res, next) => {
        if (!req.user || !req.user.user_id) {
            return next(
                new AppError('Bạn cần đăng nhập để thực hiện thanh toán', 401),
            );
        }

        const userId = req.user.user_id;
        const { address_id, note, voucher_code, payment_method, request_id } =
            req.body;

        if (!address_id) {
            return next(
                new AppError('Vui lòng cung cấp địa chỉ giao hàng', 400),
            );
        }

        if (payment_method === 'BANK_TRANSFER') {
            return next(
                new AppError(
                    'Vui lòng tạo phiên thanh toán trước khi tạo đơn hàng',
                    400,
                ),
            );
        }

        const idempotencyState = await reserveIdempotencyKey({
            scope: 'checkout-order',
            userId,
            requestId: request_id,
            payload: {
                address_id,
                note,
                voucher_code,
                payment_method: payment_method || 'COD',
            },
        });

        if (idempotencyState.status === 'conflict') {
            return next(
                new AppError(
                    'Yêu cầu checkout không hợp lệ do request_id bị tái sử dụng cho dữ liệu khác',
                    409,
                ),
            );
        }

        if (idempotencyState.status === 'in_progress') {
            return next(
                new AppError(
                    'Đơn hàng đang được xử lý. Vui lòng chờ trong giây lát',
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
            const order = await orderService.createOrderFromCart(userId, {
                address_id,
                note,
                voucher_code,
                payment_method: payment_method || 'COD',
            });

            await completeIdempotencyKey(idempotencyState.storeKey, order);

            res.status(201).json({
                success: true,
                data: order,
            });
        } catch (error) {
            await releaseIdempotencyKey(idempotencyState.storeKey);
            throw error;
        }
    });

    /**
     * GET /api/orders/my
     * Get all orders of current user
     */
    getMyOrders = catchAsync(async (req, res) => {
        const userId = req.user.user_id;
        const orders = await orderService.getUserOrders(userId);

        res.status(200).json({
            success: true,
            data: orders,
        });
    });

    /**
     * GET /api/orders/:id
     * Get specific order detail
     */
    getOrderDetail = catchAsync(async (req, res) => {
        const userId = req.user.user_id;
        const orderId = req.params.id;

        const order = await orderService.getOrderById(userId, orderId);

        res.status(200).json({
            success: true,
            data: order,
        });
    });

    /**
     * POST /api/orders/:id/reorder
     * Reorder items from a past order
     */
    reorder = catchAsync(async (req, res) => {
        const userId = req.user.user_id;
        const orderId = req.params.id;

        const results = await orderService.reorder(userId, orderId);

        res.status(200).json({
            success: true,
            data: results,
            message: 'Items added to cart',
        });
    });
}

module.exports = new orderController();
