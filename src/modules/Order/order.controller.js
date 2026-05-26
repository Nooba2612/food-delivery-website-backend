const orderService = require("./order.service");
const catchAsync = require("@core/utils/catchAsync");
const AppError = require("@core/utils/AppError");

class orderController {
  /**
   * POST /api/orders
   * Create order from the current user's cart (COD Only)
   */
  createOrderFromCart = catchAsync(async (req, res, next) => {
    if (!req.user || !req.user.user_id) {
      return next(
        new AppError("Bạn cần đăng nhập để thực hiện thanh toán", 401),
      );
    }

    const userId = req.user.user_id;
    const { address_id, note, voucher_code } = req.body;

    if (!address_id) {
      return next(new AppError("Vui lòng cung cấp địa chỉ giao hàng", 400));
    }

    const order = await orderService.createOrderFromCart(userId, {
      address_id,
      note,
      voucher_code,
      payment_method: "COD",
    });

    res.status(201).json({
      success: true,
      data: order,
    });
  });

  /**
   * GET /api/orders/my
   * Get all orders of current user
   */
  getMyOrders = catchAsync(async (req, res, next) => {
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
  getOrderDetail = catchAsync(async (req, res, next) => {
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
  reorder = catchAsync(async (req, res, next) => {
    const userId = req.user.user_id;
    const orderId = req.params.id;

    const results = await orderService.reorder(userId, orderId);

    res.status(200).json({
      success: true,
      data: results,
      message: "Items added to cart",
    });
  });
}

module.exports = new orderController();
