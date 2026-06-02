const { v4: uuidv4 } = require("uuid");
const { sequelize } = require("@core/config/sequelize");
const cartModel = require("./models/cartModel");
const cartItemModel = require("./models/cartItemModel");
const dishService = require("@modules/Dish/dish.service");
const authUserService = require("@modules/Auth/user.service");
const AppError = require("@core/utils/AppError");

const DISH_ATTRIBUTES = [
  "dish_id",
  "name",
  "price",
  "thumbnail_path",
  "available",
  "stock",
  "status",
  "brand",
];

/**
 * Retrieves the cart associated with a specific user.
 * @param {string} userId - The unique identifier of the user.
 * @param {Object} [transaction=null] - Optional Sequelize transaction.
 * @returns {Promise<Object|null>} A Promise resolving to the cart object or null if not found.
 */
const getCartByUserId = async (userId, transaction = null) => {
  return cartModel.findOne({
    where: { user_id: userId },
    transaction,
  });
};

/**
 * Retrieves the cart for a user or creates a new one if it doesn't exist.
 * @param {string} userId - The unique identifier of the user.
 * @param {Object} [transaction=null] - Optional Sequelize transaction.
 * @returns {Promise<Object>} A Promise resolving to the existing or newly created cart object.
 */
const getOrCreateCart = async (userId, transaction = null) => {
  let cart = await getCartByUserId(userId, transaction);
  if (!cart) {
    cart = await cartModel.create(
      { cart_id: uuidv4(), user_id: userId },
      { transaction },
    );
  }
  return cart;
};

/**
 * Retrieves all items within a specific cart.
 * @param {string} cartId - The unique identifier of the cart.
 * @param {Object} [transaction=null] - Optional Sequelize transaction.
 * @returns {Promise<Array>} A Promise resolving to an array of cart items.
 */
const getCartItems = async (cartId, transaction = null) => {
  return cartItemModel.findAll({
    where: { cart_id: cartId },
    order: [["created_at", "DESC"]],
    transaction,
  });
};

/**
 * Enriches raw cart items with detailed dish information, availability status, and calculates totals.
 * @param {Array} items - The raw array of cart items from the database.
 * @returns {Promise<Object>} A Promise resolving to an object containing enriched items, totalQuantity, and totalAmount.
 */
const enrichCartItems = async (items) => {
  const plainItems = items.map((item) =>
    typeof item.get === "function" ? item.get({ plain: true }) : item,
  );
  const dishIds = plainItems.map((item) => item.dishId).filter(Boolean);
  const dishes = await dishService.getDishesPlainByIds(dishIds, DISH_ATTRIBUTES);
  const dishMap = new Map(dishes.map((dish) => [dish.dish_id, dish]));

  const enrichedItems = plainItems.map((item) => {
    const dish = dishMap.get(item.dishId) || null;
    const isAvailable = !!dish && dish.available && dish.status === "active";
    const hasStock = !!dish && dish.stock >= item.quantity;

    return {
      ...item,
      dish,
      is_available: isAvailable,
      has_stock: hasStock,
      warning: !isAvailable
        ? "Sản phẩm hiện không khả dụng"
        : !hasStock
          ? "Số lượng trong kho không đủ"
          : null,
    };
  });

  const totals = enrichedItems.reduce(
    (acc, item) => {
      if (item.is_available && item.has_stock) {
        const itemPrice = Number(item.priceSnapshot || 0);
        acc.totalQuantity += item.quantity;
        acc.totalAmount += itemPrice * item.quantity;
      }
      return acc;
    },
    { totalQuantity: 0, totalAmount: 0 },
  );

  return { items: enrichedItems, ...totals };
};

/**
 * Retrieves and enriches all cart items for a specific user.
 * @param {string} userId - The unique identifier of the user.
 * @returns {Promise<Object>} A Promise resolving to the enriched cart data including items and totals.
 */
const getCartItemsByUserId = async (userId) => {
  const cart = await getCartByUserId(userId);
  if (!cart) {
    return { items: [], totalQuantity: 0, totalAmount: 0 };
  }

  const cartItems = await getCartItems(cart.cart_id);
  return enrichCartItems(cartItems);
};

/**
 * Retrieves a snapshot of the cart and its items suitable for order creation.
 * @param {string} userId - The unique identifier of the user.
 * @param {Object} [transaction=null] - Optional Sequelize transaction.
 * @returns {Promise<Object>} A Promise resolving to an object containing plain cart and item data.
 */
const getCartSnapshotForOrder = async (userId, transaction = null) => {
  const cart = await getCartByUserId(userId, transaction);
  if (!cart) {
    return { cart: null, items: [] };
  }

  const items = await getCartItems(cart.cart_id, transaction);
  return {
    cart: typeof cart.get === "function" ? cart.get({ plain: true }) : cart,
    items: items.map((item) =>
      typeof item.get === "function" ? item.get({ plain: true }) : item,
    ),
  };
};

/**
 * Adds a new item to the user's cart or increments the quantity if it already exists.
 * Validates dish availability and stock before adding.
 * @param {string} userId - The unique identifier of the user.
 * @param {string} dishId - The unique identifier of the dish to add.
 * @param {number} quantity - The quantity to add.
 * @returns {Promise<Object>} A Promise resolving to the updated and enriched cart data.
 * @throws {AppError} If user not found, dish unavailable, or stock insufficient.
 */
const addCartItem = async (userId, dishId, quantity) => {
  const transaction = await sequelize.transaction();

  try {
    const user = await authUserService.getUserById(userId, { transaction });
    if (!user) {
      throw new AppError("User không tồn tại", 404);
    }

    const cart = await getOrCreateCart(userId, transaction);
    const dish = await dishService.getDishPlainById(dishId, DISH_ATTRIBUTES, {
      transaction,
    });

    if (!dish || dish.status !== "active" || !dish.available) {
      throw new AppError("Sản phẩm không khả dụng", 400);
    }
    if (dish.stock < quantity) {
      throw new AppError(`Chỉ còn ${dish.stock} sản phẩm trong kho`, 400);
    }

    const existingItem = await cartItemModel.findOne({
      where: { cart_id: cart.cart_id, dishId },
      transaction,
    });

    if (existingItem) {
      const newQuantity = existingItem.quantity + quantity;
      if (dish.stock < newQuantity) {
        throw new AppError(
          `Không thể thêm. Tổng số lượng vượt quá kho (${dish.stock})`,
          400,
        );
      }

      await existingItem.update(
        { quantity: newQuantity, priceSnapshot: dish.price },
        { transaction },
      );
    } else {
      await cartItemModel.create(
        {
          cart_item_id: uuidv4(),
          cart_id: cart.cart_id,
          dishId,
          quantity,
          priceSnapshot: dish.price,
        },
        { transaction },
      );
    }

    await transaction.commit();
    return getCartItemsByUserId(userId);
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

/**
 * Updates the quantity of a specific item in the user's cart.
 * Removes the item if the quantity is 0 or less.
 * @param {string} userId - The unique identifier of the user.
 * @param {string} cartItemId - The unique identifier of the cart item to update.
 * @param {number} quantity - The new quantity to set.
 * @returns {Promise<Object>} A Promise resolving to the updated and enriched cart data.
 * @throws {AppError} If cart/item not found, dish unavailable, or stock insufficient.
 */
const updateCartItemQuantity = async (userId, cartItemId, quantity) => {
  const transaction = await sequelize.transaction();

  try {
    const cart = await getCartByUserId(userId, transaction);
    if (!cart) {
      throw new AppError("Giỏ hàng không tồn tại", 404);
    }

    const cartItem = await cartItemModel.findOne({
      where: { cart_item_id: cartItemId, cart_id: cart.cart_id },
      transaction,
    });

    if (!cartItem) {
      throw new AppError("Mục giỏ hàng không tồn tại", 404);
    }

    if (quantity > 0) {
      const dish = await dishService.getDishPlainById(cartItem.dishId, DISH_ATTRIBUTES, {
        transaction,
      });

      if (!dish || dish.status !== "active" || !dish.available) {
        throw new AppError("Sản phẩm không khả dụng", 400);
      }
      if (dish.stock < quantity) {
        throw new AppError(`Chỉ còn ${dish.stock} sản phẩm trong kho`, 400);
      }

      await cartItem.update(
        { quantity, priceSnapshot: dish.price },
        { transaction },
      );
    } else {
      await cartItem.destroy({ transaction });
    }

    await transaction.commit();
    return getCartItemsByUserId(userId);
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

/**
 * Deletes a specific item from the user's cart.
 * @param {string} userId - The unique identifier of the user.
 * @param {string} cartItemId - The unique identifier of the cart item to remove.
 * @returns {Promise<Object>} A Promise resolving to the updated and enriched cart data.
 */
const deleteCartItem = async (userId, cartItemId) => {
  const cart = await getCartByUserId(userId);
  if (!cart) {
    return { items: [], totalQuantity: 0, totalAmount: 0 };
  }

  await cartItemModel.destroy({
    where: { cart_item_id: cartItemId, cart_id: cart.cart_id },
  });

  return getCartItemsByUserId(userId);
};

/**
 * Clears all items from the user's cart.
 * Can be part of a larger transaction (e.g., during order creation).
 * @param {string} userId - The unique identifier of the user.
 * @param {Object} [transaction=null] - Optional Sequelize transaction.
 * @returns {Promise<Object>} A Promise resolving to an empty cart state structure.
 */
const clearCartByUserId = async (userId, transaction = null) => {
  const executeClear = async (activeTransaction) => {
    const cart = await getCartByUserId(userId, activeTransaction);
    if (cart) {
      await cartItemModel.destroy({
        where: { cart_id: cart.cart_id },
        transaction: activeTransaction,
      });
    }
  };

  if (transaction) {
    await executeClear(transaction);
    return { items: [], totalQuantity: 0, totalAmount: 0 };
  }

  const localTransaction = await sequelize.transaction();
  try {
    await executeClear(localTransaction);
    await localTransaction.commit();
    return { items: [], totalQuantity: 0, totalAmount: 0 };
  } catch (error) {
    await localTransaction.rollback();
    throw error;
  }
};

module.exports = {
  addCartItem,
  clearCartByUserId,
  deleteCartItem,
  getCartItemsByUserId,
  getCartSnapshotForOrder,
  getOrCreateCart,
  updateCartItemQuantity,
};
