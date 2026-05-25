const { v4: uuidv4 } = require("uuid");
const { Op } = require("sequelize");
const orderModel = require("./models/orderModel");
const orderItemModel = require("./models/orderItemModel");
const { sequelize } = require("@core/config/sequelize");
const AppError = require("@core/utils/AppError");
const cartService = require("@modules/Cart/cart.service");
const dishService = require("@modules/Dish/dish.service");
const addressService = require("@modules/User/address.service");
const voucherService = require("@modules/Voucher/voucher.service");
const authUserService = require("@modules/Auth/user.service");

const ORDER_DISH_ATTRIBUTES = [
  "dish_id",
  "name",
  "price",
  "thumbnail_path",
  "available",
  "stock",
  "status",
  "brand",
  "preparation_time",
];

const normalizeOrderItem = (item) =>
  typeof item.get === "function" ? item.get({ plain: true }) : item;

const createDishMap = async (items) => {
  const dishIds = items.map((item) => item.dish_id).filter(Boolean);
  const dishes = await dishService.getDishesPlainByIds(dishIds, ORDER_DISH_ATTRIBUTES);
  return new Map(dishes.map((dish) => [dish.dish_id, dish]));
};

const formatOrder = (plainOrder, dishMap) => ({
  order_id: plainOrder.order_id,
  date: plainOrder.order_date,
  status: plainOrder.order_status,
  brand: plainOrder.brand || "Eatsy",
  estimated_time: plainOrder.estimated_time,
  total_amount: plainOrder.total_amount,
  payment_method: plainOrder.payment_method,
  delivery_address: plainOrder.delivery_address,
  voucher_code: plainOrder.voucher_code,
  discount_amount: plainOrder.discount_amount || 0,
  items_preview: plainOrder.items.map((item) => {
    const dish = dishMap.get(item.dish_id);
    return {
      name: item.name || dish?.name || "Unknown Dish",
      quantity: item.quantity,
    };
  }),
  items: plainOrder.items.map((item) => {
    const dish = dishMap.get(item.dish_id);
    return {
      dish_id: item.dish_id,
      name: item.name || dish?.name || "Unknown Dish",
      quantity: item.quantity,
      price: item.price,
      thumbnail: dish?.thumbnail_path || null,
    };
  }),
});

const buildAddressSnapshot = (address) =>
  [address.street, address.ward, address.city].filter(Boolean).join(", ");

const validateDishForCheckout = (dish, quantity) => {
  if (!dish || dish.status !== "active" || !dish.available) {
    throw new AppError(
      `Món ăn '${dish?.name || "không xác định"}' hiện không khả dụng`,
      400,
    );
  }

  if (dish.stock < quantity) {
    throw new AppError(`Món ăn '${dish.name}' không đủ số lượng trong kho`, 400);
  }
};

const OrderService = {
  getUserOrders: async (userId) => {
    const orders = await orderModel.findAll({
      where: { user_id: userId },
      include: [{ model: orderItemModel, as: "items" }],
      order: [["order_date", "DESC"]],
    });

    const plainOrders = orders.map((order) => {
      const plainOrder = order.get({ plain: true });
      plainOrder.items = plainOrder.items.map(normalizeOrderItem);
      return plainOrder;
    });

    const allItems = plainOrders.flatMap((order) => order.items);
    const dishMap = await createDishMap(allItems);

    return plainOrders.map((plainOrder) => formatOrder(plainOrder, dishMap));
  },

  createOrderFromCart: async (userId, orderData) => {
    const transaction = await sequelize.transaction();

    try {
      const { address_id, payment_method, note, voucher_code } = orderData;

      const { cart, items: cartItems } = await cartService.getCartSnapshotForOrder(
        userId,
        transaction,
      );

      if (!cart || cartItems.length === 0) {
        throw new AppError("Giỏ hàng của bạn đang trống", 400);
      }

      const address = await addressService.getAddressByIdForUser(
        userId,
        address_id,
        transaction,
      );
      if (!address) {
        throw new AppError("Địa chỉ giao hàng không hợp lệ", 404);
      }

      let totalAmount = 0;
      const validatedItems = [];

      for (const item of cartItems) {
        const dish = await dishService.getDishPlainById(item.dishId, ORDER_DISH_ATTRIBUTES, {
          transaction,
        });
        validateDishForCheckout(dish, item.quantity);

        const itemPrice = Number(item.priceSnapshot || 0);
        totalAmount += itemPrice * item.quantity;

        validatedItems.push({
          dish_id: item.dishId,
          name: dish.name,
          price: itemPrice,
          quantity: item.quantity,
          preparation_time: dish.preparation_time || 0,
          brand: dish.brand || "Eatsy",
        });
      }

      const brands = [...new Set(validatedItems.map((item) => item.brand))];
      const orderBrand = brands.length === 1 ? brands[0] : "Mixed Brands";

      let discountAmount = 0;
      let appliedVoucher = null;

      if (voucher_code) {
        const voucher = await voucherService.getActiveVoucherByCode(
          voucher_code,
          transaction,
        );

        if (!voucher) {
          throw new AppError("Mã giảm giá không hợp lệ hoặc đã hết hạn", 400);
        }
        if (totalAmount < voucher.min_purchase) {
          throw new AppError(
            `Đơn hàng tối thiểu ${voucher.min_purchase.toLocaleString("vi-VN")}₫ để áp dụng mã này`,
            400,
          );
        }

        discountAmount =
          voucher.discount_type === "Percentage"
            ? totalAmount * voucher.discount_value
            : Math.min(voucher.discount_value, totalAmount);

        await voucherService.decrementVoucherUsage(voucher, transaction);
        appliedVoucher = {
          voucher_id: voucher.voucher_id,
          code: voucher.code,
          discount_amount: discountAmount,
        };
      }

      const finalAmount = Math.max(0, totalAmount - discountAmount);
      const maxPrepTime = Math.max(
        ...validatedItems.map((item) => item.preparation_time),
        0,
      );
      const estimatedTime = 15 + maxPrepTime;
      const orderId = uuidv4();

      await orderModel.create(
        {
          order_id: orderId,
          user_id: userId,
          quantity: validatedItems.reduce((sum, item) => sum + item.quantity, 0),
          foods: validatedItems
            .map((item) => `${item.name} x${item.quantity}`)
            .join(", "),
          brand: orderBrand,
          estimated_time: estimatedTime,
          order_note: note,
          order_status: "pending",
          address_id,
          payment_method: payment_method || "COD",
          payment_status: "unpaid",
          total_amount: finalAmount,
          delivery_address: buildAddressSnapshot(address),
          voucher_code: appliedVoucher ? appliedVoucher.code : null,
          discount_amount: discountAmount,
        },
        { transaction },
      );

      await orderItemModel.bulkCreate(
        validatedItems.map((item) => ({
          order_item_id: uuidv4(),
          order_id: orderId,
          dish_id: item.dish_id,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
        })),
        { transaction },
      );

      for (const item of validatedItems) {
        await dishService.decrementDishStock(
          item.dish_id,
          item.quantity,
          transaction,
        );
      }

      await cartService.clearCartByUserId(userId, transaction);
      await transaction.commit();

      return {
        order_id: orderId,
        total_amount: finalAmount,
        original_amount: totalAmount,
        discount_amount: discountAmount,
        voucher_applied: appliedVoucher ? appliedVoucher.code : null,
        status: "pending",
        payment_method: payment_method || "COD",
        brand: orderBrand,
        estimated_time: estimatedTime,
        items: validatedItems.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          price: item.price,
        })),
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  getOrderById: async (userId, orderId) => {
    const order = await orderModel.findOne({
      where: { order_id: orderId },
      include: [{ model: orderItemModel, as: "items" }],
    });

    if (!order) {
      throw new AppError("Order not found", 404);
    }
    if (order.user_id !== userId) {
      throw new AppError("Access denied", 403);
    }

    const plainOrder = order.get({ plain: true });
    plainOrder.items = plainOrder.items.map(normalizeOrderItem);
    const dishMap = await createDishMap(plainOrder.items);

    return {
      order_id: plainOrder.order_id,
      status: plainOrder.order_status,
      brand: plainOrder.brand || "Eatsy",
      estimated_time: plainOrder.estimated_time,
      total_amount: plainOrder.total_amount,
      delivery_address: plainOrder.delivery_address,
      created_at: plainOrder.order_date,
      payment_method: plainOrder.payment_method,
      payment_status: plainOrder.payment_status,
      items: plainOrder.items.map((item) => {
        const dish = dishMap.get(item.dish_id);
        return {
          name: item.name || dish?.name || "Unknown Dish",
          quantity: item.quantity,
          price: item.price,
          thumbnail: dish?.thumbnail_path || null,
        };
      }),
    };
  },

  updateOrderStatus: async (orderId, status) => {
    const order = await orderModel.findOne({ where: { order_id: orderId } });
    if (!order) {
      throw new AppError("Order not found", 404);
    }

    const validStatuses = [
      "pending",
      "confirmed",
      "delivering",
      "delivered",
      "cancelled",
    ];
    if (!validStatuses.includes(status)) {
      throw new AppError("Invalid status", 400);
    }

    await order.update({ order_status: status });
    return order;
  },

  getOrderStats: async () => {
    const [total, pending, confirmed, delivering, delivered, cancelled] =
      await Promise.all([
        orderModel.count(),
        orderModel.count({ where: { order_status: "pending" } }),
        orderModel.count({ where: { order_status: "confirmed" } }),
        orderModel.count({ where: { order_status: "delivering" } }),
        orderModel.count({ where: { order_status: "delivered" } }),
        orderModel.count({ where: { order_status: "cancelled" } }),
      ]);

    return { total, pending, confirmed, delivering, delivered, cancelled };
  },

  getOrdersForAdmin: async ({ search = "", status = "", page = 1, limit = 10 }) => {
    const where = {};

    if (status) where.order_status = status;
    if (search) {
      where[Op.or] = [
        { order_id: { [Op.like]: `%${search}%` } },
        { delivery_address: { [Op.like]: `%${search}%` } },
      ];
    }

    const parsedPage = parseInt(page, 10);
    const parsedLimit = parseInt(limit, 10);
    const offset = (parsedPage - 1) * parsedLimit;

    const { rows, count } = await orderModel.findAndCountAll({
      where,
      include: [{ model: orderItemModel, as: "items" }],
      order: [["order_date", "DESC"]],
      limit: parsedLimit,
      offset,
    });

    const orders = [];
    for (const order of rows) {
      const plainOrder = order.get({ plain: true });
      const user = await authUserService.getUserById(plainOrder.user_id);
      const dishMap = await createDishMap(plainOrder.items || []);

      orders.push({
        ...plainOrder,
        user: user
          ? {
              fullname: user.fullname,
              email: user.email,
              phoneNumber: user.phoneNumber,
            }
          : null,
        items: (plainOrder.items || []).map((item) => {
          const dish = dishMap.get(item.dish_id);
          return {
            ...item,
            dish: dish
              ? {
                  thumbnail_path: dish.thumbnail_path,
                  name: dish.name,
                }
              : null,
          };
        }),
      });
    }

    return {
      orders,
      total: count,
      page: parsedPage,
      limit: parsedLimit,
    };
  },

  getOrderSummary: async (orderId) => {
    const order = await orderModel.findOne({
      where: { order_id: orderId },
      attributes: [
        "order_id",
        "user_id",
        "order_status",
        "brand",
        "estimated_time",
        "order_date",
      ],
      include: [{ model: orderItemModel, as: "items", attributes: ["dish_id", "quantity", "price"] }],
    });

    if (!order) {
      throw new AppError("Order not found", 404);
    }

    const plainOrder = order.get({ plain: true });
    plainOrder.items = plainOrder.items.map(normalizeOrderItem);
    const dishMap = await createDishMap(plainOrder.items);

    return {
      order_id: plainOrder.order_id,
      user_id: plainOrder.user_id,
      status: plainOrder.order_status,
      brand: plainOrder.brand || "Eatsy",
      estimated_time: plainOrder.estimated_time,
      total_amount: plainOrder.items.reduce(
        (sum, item) => sum + item.quantity * Number(item.price || 0),
        0,
      ),
      items_preview: plainOrder.items.map((item) => ({
        name: dishMap.get(item.dish_id)?.name || "Unknown Dish",
        quantity: item.quantity,
      })),
    };
  },

  reorder: async (userId, orderId) => {
    const order = await orderModel.findOne({
      where: { order_id: orderId, user_id: userId },
      include: [{ model: orderItemModel, as: "items" }],
    });

    if (!order) {
      throw new AppError("Order not found", 404);
    }

    const results = { added: [], skipped: [] };

    for (const item of order.items.map(normalizeOrderItem)) {
      try {
        const dish = await dishService.getDishPlainById(item.dish_id, ORDER_DISH_ATTRIBUTES);
        validateDishForCheckout(dish, item.quantity);
        await cartService.addCartItem(userId, item.dish_id, item.quantity);
        results.added.push({ dish_id: item.dish_id, name: item.name });
      } catch (error) {
        results.skipped.push({
          dish_id: item.dish_id,
          name: item.name,
          reason: error.message,
        });
      }
    }

    return results;
  },
};

module.exports = OrderService;
