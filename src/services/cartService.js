const { v4: uuidv4 } = require("uuid");
const { sequelize } = require("@config/sequelize");
const { cartModel, cartItemModel, dishModel, userModel } = require("@models");
const AppError = require("@utils/AppError");

/**
 * Get all cart items for a user, enriched with Dish details and computed totals.
 */
const getCartItemsByUserId = async (user_id) => {
    try {
        const cart = await cartModel.findOne({
            where: { user_id },
        });

        if (!cart) {
            return {
                items: [],
                totalQuantity: 0,
                totalAmount: 0,
            };
        }

        const cartItems = await cartItemModel.findAll({
            where: { cart_id: cart.cart_id },
            include: [
                {
                    model: dishModel,
                    as: "dish",
                    attributes: ["name", "price", "thumbnail_path", "available", "stock", "status", "brand"],
                },
            ],
            order: [["created_at", "DESC"]],
        });

        const enrichedItems = cartItems.map((item) => {
            const plainItem = item.get({ plain: true });
            const dish = item.dish;
            const is_available = dish && dish.available && dish.status === "active";
            const has_stock = dish && dish.stock >= item.quantity;

            console.log("🔍 Cart Item Debug:", {
                cart_item_id: plainItem.cart_item_id,
                price_snapshot: plainItem.price_snapshot,
                quantity: plainItem.quantity,
                dish_name: dish?.name
            });

            return {
                ...plainItem,
                is_available,
                has_stock,
                warning: !is_available ? "Sản phẩm hiện không khả dụng" : !has_stock ? "Số lượng trong kho không đủ" : null,
            };
        });

        const totals = enrichedItems.reduce(
            (acc, item) => {
                if (item.is_available && item.has_stock) {
                    acc.totalQuantity += item.quantity;
                    // Support both priceSnapshot and price_snapshot
                    const itemPrice = item.priceSnapshot || item.price_snapshot || 0;
                    acc.totalAmount += Number(itemPrice) * item.quantity;
                }
                return acc;
            },
            { totalQuantity: 0, totalAmount: 0 },
        );

        return {
            items: enrichedItems,
            ...totals,
        };
    } catch (error) {
        console.error("Error in getCartItemsByUserId:", error);
        throw error;
    }
};

/**
 * Add or increment item in cart with stock validation and transaction.
 * Ensures user existence before any database modification.
 */
const addCartItem = async (userId, dishId, quantity) => {
    const transaction = await sequelize.transaction();
    
    console.group("🛒 ADD TO CART FLOW");
    console.log("Input:", { userId, dishId, quantity });

    try {
        // 1. User validation (findOne as requested)
        const user = await userModel.findOne({
            where: { user_id: userId },
            transaction
        });

        console.log("User found:", !!user);

        if (!user) {
            throw new AppError("User không tồn tại", 404);
        }

        // 2. Ensure Cart exists
        let cart = await cartModel.findOne({ where: { user_id: userId }, transaction });
        if (!cart) {
            console.log("Creating new cart for user...");
            cart = await cartModel.create({ cart_id: uuidv4(), user_id: userId }, { transaction });
        }

        // 3. Validate Dish availability & stock
        const dish = await dishModel.findOne({ where: { dish_id: dishId }, transaction });
        if (!dish || dish.status !== "active" || !dish.available) {
            throw new AppError("Sản phẩm không khả dụng", 400);
        }

        if (dish.stock < quantity) {
            throw new AppError(`Chỉ còn ${dish.stock} sản phẩm trong kho`, 400);
        }

        // 4. Add or Update CartItem
        const existingItem = await cartItemModel.findOne({
            where: { cart_id: cart.cart_id, dishId: dishId },
            transaction,
        });

        if (existingItem) {
            console.log("Item exists, updating quantity...");
            const newQuantity = existingItem.quantity + quantity;
            if (dish.stock < newQuantity) {
                throw new AppError(`Không thể thêm. Tổng số lượng vượt quá kho (${dish.stock})`, 400);
            }
            await existingItem.update({ quantity: newQuantity, priceSnapshot: dish.price }, { transaction });
        } else {
            console.log("Item is new, creating mapping...");
            await cartItemModel.create(
                {
                    cart_item_id: uuidv4(),
                    cart_id: cart.cart_id,
                    dishId: dishId,
                    quantity,
                    priceSnapshot: dish.price,  // Use attribute name, not field name
                },
                { transaction },
            );
        }

        await transaction.commit();
        console.log("✅ TRANSACTION COMMITTED - Success");
        console.groupEnd();
        
        return await getCartItemsByUserId(userId);
    } catch (error) {
        await transaction.rollback();
        console.error("❌ TRANSACTION FAILED - Rollback:", error.message);
        console.groupEnd();
        throw error;
    }
};

/**
 * Update item quantity with stock validation.
 */
const updateCartItemQuantity = async (userId, cartItemId, quantity) => {
    const transaction = await sequelize.transaction();
    try {
        const cartItem = await cartItemModel.findOne({
            where: { cart_item_id: cartItemId },
            include: [{ model: dishModel, as: "dish" }],
            transaction,
        });

        if (!cartItem) throw new AppError("Mục giỏ hàng không tồn tại", 404);

        if (quantity > 0) {
            const dish = cartItem.dish;
            if (!dish || dish.status !== "active" || !dish.available) {
                throw new AppError("Sản phẩm không khả dụng", 400);
            }
            if (dish.stock < quantity) {
                throw new AppError(`Chỉ còn ${dish.stock} sản phẩm trong kho`, 400);
            }
            await cartItem.update({ quantity, price_snapshot: dish.price }, { transaction });
        } else {
            await cartItem.destroy({ transaction });
        }

        await transaction.commit();
        return await getCartItemsByUserId(userId);
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
};

/**
 * Delete single cart item.
 */
const deleteCartItem = async (userId, cartItemId) => {
    try {
        await cartItemModel.destroy({
            where: { cart_item_id: cartItemId },
        });
        return await getCartItemsByUserId(userId);
    } catch (error) {
        console.error("Error in deleteCartItem:", error);
        throw error;
    }
};

/**
 * Clear all items in user's cart.
 */
const clearCartByUserId = async (userId) => {
    const transaction = await sequelize.transaction();
    try {
        const cart = await cartModel.findOne({ where: { user_id: userId }, transaction });
        if (cart) {
            await cartItemModel.destroy({
                where: { cart_id: cart.cart_id },
                transaction,
            });
        }
        await transaction.commit();
        return { items: [], totalQuantity: 0, totalAmount: 0 };
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
};

module.exports = {
    getCartItemsByUserId,
    addCartItem,
    updateCartItemQuantity,
    deleteCartItem,
    clearCartByUserId,
};
