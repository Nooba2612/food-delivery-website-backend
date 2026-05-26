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

const getCartByUserId = async (userId, transaction = null) => {
  return cartModel.findOne({
    where: { user_id: userId },
    transaction,
  });
};

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

const getCartItems = async (cartId, transaction = null) => {
  return cartItemModel.findAll({
    where: { cart_id: cartId },
    order: [["created_at", "DESC"]],
    transaction,
  });
};

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

const getCartItemsByUserId = async (userId) => {
  const cart = await getCartByUserId(userId);
  if (!cart) {
    return { items: [], totalQuantity: 0, totalAmount: 0 };
  }

  const cartItems = await getCartItems(cart.cart_id);
  return enrichCartItems(cartItems);
};

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
