const cartService = require("./cart.service");
const catchAsync = require("@core/utils/catchAsync");
const AppError = require("@core/utils/AppError");

class cartController {
  /**
   * GET /api/cart
   * Returns user's cart enriched with dish details and computed totals
   */
  getCart = catchAsync(async (req, res, next) => {
    // Guard: Prevent crash if req.user is missing
    if (!req.user || !req.user.user_id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const userId = req.user.user_id;
    console.log("DEBUG: Fetching cart for user:", userId);

    const cartData = await cartService.getCartItemsByUserId(userId);

    res.status(200).json({
      success: true,
      data: cartData,
    });
  });

  /**
   * POST /api/cart/items
   * Add or increment item in cart
   */
  addItem = catchAsync(async (req, res, next) => {
    if (!req.user || !req.user.user_id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const userId = req.user.user_id;
    const { dishId, quantity } = req.body;

    console.log("🛒 REQ BODY:", req.body);

    if (!dishId || !quantity) {
      return next(new AppError("dishId is required", 400));
    }

    const cartData = await cartService.addCartItem(
      userId,
      dishId,
      parseInt(quantity),
    );

    res.status(200).json({
      success: true,
      data: cartData,
    });
  });

  /**
   * PUT /api/cart/items/:id
   * Update quantity of a cart item
   */
  updateItem = catchAsync(async (req, res, next) => {
    if (!req.user || !req.user.user_id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const userId = req.user.user_id;
    const cartItemId = req.params.id;
    const { quantity } = req.body;

    if (quantity === undefined) {
      return next(new AppError("Thiếu thông tin số lượng", 400));
    }

    const cartData = await cartService.updateCartItemQuantity(
      userId,
      cartItemId,
      parseInt(quantity),
    );

    res.status(200).json({
      success: true,
      data: cartData,
    });
  });

  /**
   * DELETE /api/cart/items/:id
   * Remove single item from cart
   */
  deleteItem = catchAsync(async (req, res, next) => {
    if (!req.user || !req.user.user_id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const userId = req.user.user_id;
    const cartItemId = req.params.id;

    const cartData = await cartService.deleteCartItem(userId, cartItemId);

    res.status(200).json({
      success: true,
      data: cartData,
    });
  });

  /**
   * DELETE /api/cart/items/clear
   * Empty entire cart
   */
  clearCart = catchAsync(async (req, res, next) => {
    if (!req.user || !req.user.user_id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const userId = req.user.user_id;
    const cartData = await cartService.clearCartByUserId(userId);

    res.status(200).json({
      success: true,
      data: cartData,
    });
  });
}

module.exports = new cartController();
