const { orderModel, orderItemModel, dishModel, cartModel, cartItemModel } = require("@models");
const { v4: uuidv4 } = require("uuid");

const OrderService = {
    // GET /users/orders
    getUserOrders: async (userId) => {
        try {
            const orders = await orderModel.findAll({
                where: { account_id: userId },
                include: [
                    {
                        model: orderItemModel,
                        as: "items",
                        include: [
                            {
                                model: dishModel,
                                as: "dish",
                                attributes: ["name", "thumbnail_path"],
                            },
                        ],
                    },
                ],
                order: [["order_date", "DESC"]],
            });

            return orders.map((order) => {
                const plainOrder = order.get({ plain: true });
                return {
                    order_id: plainOrder.order_id,
                    date: plainOrder.order_date,
                    status: plainOrder.order_status,
                    brand: plainOrder.brand || "Eatsy",
                    estimated_time: plainOrder.estimated_time,
                    total_amount: plainOrder.total_amount,
                    payment_method: plainOrder.payment_method,
                    delivery_address: plainOrder.delivery_address,
                    items_preview: plainOrder.items.map((item) => ({
                        name: item.name || item.dish?.name || "Unknown Dish",
                        quantity: item.quantity,
                    })),
                    items: plainOrder.items.map((item) => ({
                        dish_id: item.dish_id,
                        name: item.name || item.dish?.name || "Unknown Dish",
                        quantity: item.quantity,
                        price: item.price,
                        thumbnail: item.dish?.thumbnail_path,
                    })),
                };
            });
        } catch (error) {
            console.error("Error fetching user orders:", error);
            throw error;
        }
    },

    // ... (reorder omitted for brevity but stays same)

    // POST /api/orders
    createOrderFromCart: async (userId, orderData) => {
        const { sequelize } = require("@config/sequelize");
        const { addressModel, dishModel, voucherModel, accountVoucher } = require("@models");
        const AppError = require("../utils/AppError");
        const { Op } = require("sequelize");
        
        const t = await sequelize.transaction();

        try {
            const { address_id, payment_method, note, voucher_code } = orderData;

            // 1. Fetch Cart and Items
            const cart = await cartModel.findOne({ 
                where: { user_id: userId },
                include: [{
                    model: cartItemModel,
                    as: 'items',
                    include: [{ model: dishModel, as: 'dish' }]
                }],
                transaction: t
            });

            if (!cart || !cart.items || cart.items.length === 0) {
                throw new AppError("Giỏ hàng của bạn đang trống", 400);
            }

            // 2. Fetch address for snapshot
            const address = await addressModel.findOne({
                where: { address_id, user_id: userId },
                transaction: t
            });

            if (!address) {
                throw new AppError("Địa chỉ giao hàng không hợp lệ", 404);
            }

            const addressSnapshot = `${address.street}, ${address.ward ? address.ward + ", " : ""}${address.district ? address.district + ", " : ""}${address.city}, ${address.country}`;

            // 3. Validate items and calculate total (using SNAPSHOT prices)
            let totalAmount = 0;
            const validatedItems = cart.items.map(item => {
                const dish = item.dish;
                if (!dish || dish.status !== 'active' || !dish.available) {
                    throw new AppError(`Món ăn '${dish?.name || 'không xác định'}' hiện không khả dụng`, 400);
                }
                if (dish.stock < item.quantity) {
                    throw new AppError(`Món ăn '${dish.name}' không đủ số lượng trong kho`, 400);
                }
                
                // Use price_snapshot from cart item
                const itemPrice = parseFloat(item.price_snapshot);
                totalAmount += itemPrice * item.quantity;

                return {
                    dish_id: item.dish_id,
                    name: dish.name,
                    price: itemPrice,
                    quantity: item.quantity,
                    preparation_time: dish.preparation_time || 0,
                    brand: dish.brand || "Eatsy"
                };
            });

            // 4. Enforce single-brand rule (if required by business)
            const brands = [...new Set(validatedItems.map(i => i.brand))];
            const orderBrand = brands.length === 1 ? brands[0] : "Mixed Brands";

            // 4.5. Apply Voucher if provided
            let discountAmount = 0;
            let appliedVoucher = null;
            
            if (voucher_code) {
                const voucher = await voucherModel.findOne({
                    where: { 
                        code: voucher_code,
                        valid_from: { [Op.lte]: new Date() },
                        valid_to: { [Op.gte]: new Date() },
                        number_of_uses: { [Op.gt]: 0 }
                    },
                    transaction: t
                });

                if (!voucher) {
                    throw new AppError("Mã giảm giá không hợp lệ hoặc đã hết hạn", 400);
                }

                // Check min purchase requirement
                if (totalAmount < voucher.min_purchase) {
                    throw new AppError(`Đơn hàng tối thiểu ${voucher.min_purchase.toLocaleString('vi-VN')}₫ để áp dụng mã này`, 400);
                }

                // Calculate discount
                if (voucher.discount_type === 'Percentage') {
                    discountAmount = totalAmount * voucher.discount_value;
                } else {
                    discountAmount = Math.min(voucher.discount_value, totalAmount);
                }

                // Decrease voucher uses
                await voucher.decrement('number_of_uses', { by: 1, transaction: t });
                
                appliedVoucher = {
                    voucher_id: voucher.voucher_id,
                    code: voucher.code,
                    discount_amount: discountAmount
                };
            }

            const finalAmount = Math.max(0, totalAmount - discountAmount);

            // 5. Compute estimated delivery time
            const BASE_DELIVERY_MINUTES = 15;
            const maxPrepTime = Math.max(...validatedItems.map(i => i.preparation_time), 0);
            const estimatedTime = BASE_DELIVERY_MINUTES + maxPrepTime;

            // 6. Create the Order
            const orderId = uuidv4();
            await orderModel.create(
                {
                    order_id: orderId,
                    account_id: userId,
                    quantity: validatedItems.reduce((acc, i) => acc + i.quantity, 0),
                    foods: validatedItems.map((i) => `${i.name} x${i.quantity}`).join(", "),
                    brand: orderBrand,
                    estimated_time: estimatedTime,
                    order_note: note,
                    order_status: "pending",
                    address_id,
                    payment_method: payment_method || "COD",
                    payment_status: "unpaid",
                    total_amount: finalAmount,
                    delivery_address: addressSnapshot,
                    voucher_code: appliedVoucher ? appliedVoucher.code : null,
                    discount_amount: discountAmount
                },
                { transaction: t },
            );

            // 7. Create Order Items with Snapshots
            const orderItemsData = validatedItems.map((item) => ({
                order_item_id: uuidv4(),
                order_id: orderId,
                dish_id: item.dish_id,
                name: item.name,
                price: item.price,
                quantity: item.quantity,
            }));

            await orderItemModel.bulkCreate(orderItemsData, { transaction: t });

            // 8. Update Dish stock
            // (Optional but recommended for production)
            for (const item of validatedItems) {
                await dishModel.decrement('stock', {
                    by: item.quantity,
                    where: { dish_id: item.dish_id },
                    transaction: t
                });
            }

            // 9. Clear Cart items (DO NOT delete Cart itself)
            await cartItemModel.destroy({
                where: { cart_id: cart.cart_id },
                transaction: t,
            });

            await t.commit();
            
            return {
                order_id: orderId,
                total_amount: finalAmount,
                original_amount: totalAmount,
                discount_amount: discountAmount,
                voucher_applied: appliedVoucher ? appliedVoucher.code : null,
                status: "pending",
                payment_method: "COD"
            };
        } catch (error) {
            if (t) await t.rollback();
            throw error;
        }
    },

    // GET /user/orders/:id
    getOrderById: async (userId, orderId) => {
        try {
            const order = await orderModel.findOne({
                where: { order_id: orderId },
                include: [
                    {
                        model: orderItemModel,
                        as: "items",
                        include: [
                            {
                                model: dishModel,
                                as: "dish",
                                attributes: ["name", "thumbnail_path"],
                            },
                        ],
                    },
                ],
            });

            if (!order) {
                const error = new Error("Order not found");
                error.status = 404;
                throw error;
            }

            if (order.account_id !== userId) {
                const error = new Error("Access denied");
                error.status = 403;
                throw error;
            }

            const plainOrder = order.get({ plain: true });
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
                items: plainOrder.items.map((item) => ({
                    name: item.name || item.dish?.name || "Unknown Dish",
                    quantity: item.quantity,
                    price: item.price,
                    thumbnail: item.dish?.thumbnail_path,
                })),
            };
        } catch (error) {
            console.error("Error fetching order detail:", error);
            throw error;
        }
    },
    
    // PUT /admin/orders/:id/status
    updateOrderStatus: async (orderId, status) => {
        try {
            const order = await orderModel.findOne({ where: { order_id: orderId } });
            if (!order) {
                const error = new Error("Order not found");
                error.status = 404;
                throw error;
            }

            // Valid status transitions
            const validStatuses = ['pending', 'confirmed', 'delivering', 'delivered', 'cancelled'];
            if (!validStatuses.includes(status)) {
                const error = new Error("Invalid status");
                error.status = 400;
                throw error;
            }

            await order.update({ order_status: status });
            return order;
        } catch (error) {
            console.error("Error updating order status:", error);
            throw error;
        }
    },

    /**
     * Lightweight order summary for socket emission.
     * Fetches only the fields needed for real-time UI updates.
     */
    getOrderSummary: async (orderId) => {
        try {
            const order = await orderModel.findOne({
                where: { order_id: orderId },
                attributes: ["order_id", "order_status", "brand", "estimated_time", "order_date"],
                include: [
                    {
                        model: orderItemModel,
                        as: "items",
                        attributes: ["quantity"],
                        include: [
                            {
                                model: dishModel,
                                as: "dish",
                                attributes: ["name", "price"],
                            },
                        ],
                    },
                ],
            });

            if (!order) {
                const error = new Error("Order not found");
                error.status = 404;
                throw error;
            }

            const plainOrder = order.get({ plain: true });
            return {
                order_id: plainOrder.order_id,
                status: plainOrder.order_status,
                brand: plainOrder.brand || "Eatsy",
                estimated_time: plainOrder.estimated_time,
                total_amount: plainOrder.items.reduce(
                    (sum, item) => sum + item.quantity * (item.dish?.price || 0),
                    0,
                ),
                items_preview: plainOrder.items.map((item) => ({
                    name: item.dish?.name || "Unknown Dish",
                    quantity: item.quantity,
                })),
            };
        } catch (error) {
            console.error("Error fetching order summary:", error);
            throw error;
        }
    },
    /**
     * Reorder items from a past order.
     * Logic: Fetch past order items, try adding them to the user's cart.
     * If an item is unavailable or out of stock, skip it or report back.
     */
    reorder: async (userId, orderId) => {
        const { cartModel, cartItemModel, orderItemModel, dishModel } = require("@models");
        const { sequelize } = require("@config/sequelize");
        const { v4: uuidv4 } = require("uuid");

        const t = await sequelize.transaction();

        try {
            // 1. Fetch the past order and its items
            const order = await orderModel.findOne({
                where: { order_id: orderId, account_id: userId },
                include: [{ model: orderItemModel, as: "items" }],
                transaction: t,
            });

            if (!order) {
                const error = new Error("Order not found");
                error.status = 404;
                throw error;
            }

            // 2. Ensure User has a Cart
            let cart = await cartModel.findOne({ where: { user_id: userId }, transaction: t });
            if (!cart) {
                cart = await cartModel.create({ cart_id: uuidv4(), user_id: userId }, { transaction: t });
            }

            const results = { added: [], skipped: [] };

            // 3. Process each item from the past order
            for (const item of order.items) {
                const dish = await dishModel.findOne({
                    where: { dish_id: item.dish_id },
                    transaction: t,
                });

                // Check availability and stock
                if (!dish || dish.status !== "active" || !dish.available || dish.stock < item.quantity) {
                    results.skipped.push({ dish_id: item.dish_id, name: item.name });
                    continue;
                }

                // Check if already in cart
                const existingCartItem = await cartItemModel.findOne({
                    where: { cart_id: cart.cart_id, dish_id: item.dish_id },
                    transaction: t,
                });

                if (existingCartItem) {
                    const newQty = existingCartItem.quantity + item.quantity;
                    // Cap at stock if adding more exceeds it (or just fail adding more)
                    if (dish.stock >= newQty) {
                        await existingCartItem.update({ quantity: newQty, price_snapshot: dish.price }, { transaction: t });
                        results.added.push({ dish_id: item.dish_id, name: item.name });
                    } else {
                        results.skipped.push({ dish_id: item.dish_id, name: item.name, reason: "Insufficient stock for full reorder" });
                    }
                } else {
                    await cartItemModel.create(
                        {
                            cart_item_id: uuidv4(),
                            cart_id: cart.cart_id,
                            dish_id: item.dish_id,
                            quantity: item.quantity,
                            price_snapshot: dish.price,
                        },
                        { transaction: t },
                    );
                    results.added.push({ dish_id: item.dish_id, name: item.name });
                }
            }

            await t.commit();
            return results;
        } catch (error) {
            if (t) await t.rollback();
            console.error("Error in reorder service:", error);
            throw error;
        }
    },
};

module.exports = OrderService;
