const {
    pendingPaymentModel,
    orderModel,
    orderItemModel,
    dishModel,
    cartModel,
    cartItemModel,
    userModel,
} = require('@models');
const { v4: uuidv4 } = require('uuid');
const { sequelize } = require('@config/sequelize');
const AppError = require('@utils/AppError');
const { Op } = require('sequelize');
const { buildVietQrImageUrl } = require('@utils/vietqr');

const buildAddressSnapshot = (address) => {
    return `${address.street}, ${address.ward ? address.ward + ', ' : ''}${address.district ? address.district + ', ' : ''}${address.city}, ${address.country}`;
};

const getVietQrConfig = () => {
    const bankCode = process.env.VIETQR_BANK_CODE || 'MB';
    const accountNo = process.env.VIETQR_ACCOUNT_NO;
    const accountName = process.env.VIETQR_ACCOUNT_NAME;

    if (!accountNo || !accountName) {
        throw new AppError(
            'Thiếu cấu hình VietQR (VIETQR_ACCOUNT_NO/VIETQR_ACCOUNT_NAME)',
            500,
        );
    }

    return { bankCode, accountNo, accountName };
};

const validateAndSnapshotCart = async (userId, transaction) => {
    const { addressModel, voucherModel } = require('@models');

    const cart = await cartModel.findOne({
        where: { user_id: userId },
        include: [
            {
                model: cartItemModel,
                as: 'items',
                include: [{ model: dishModel, as: 'dish' }],
            },
        ],
        transaction,
    });

    if (!cart || !cart.items || cart.items.length === 0) {
        throw new AppError('Giỏ hàng của bạn đang trống', 400);
    }

    return { cart, addressModel, voucherModel };
};

const PaymentService = {
    listPendingPayments: async ({
        status = 'pending',
        page = 1,
        limit = 20,
    } = {}) => {
        const safePage = Math.max(1, Number(page) || 1);
        const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
        const offset = (safePage - 1) * safeLimit;

        const where = status ? { payment_status: status } : {};

        const { count, rows } = await pendingPaymentModel.findAndCountAll({
            where,
            order: [['createdAt', 'DESC']],
            limit: safeLimit,
            offset,
            include: [
                {
                    model: userModel,
                    as: 'user',
                    attributes: ['userId', 'fullname', 'phoneNumber', 'email'],
                },
            ],
        });

        return {
            total: count,
            page: safePage,
            limit: safeLimit,
            payments: rows.map((payment) => payment.get({ plain: true })),
        };
    },
    createPendingPaymentFromCart: async (userId, paymentData) => {
        const t = await sequelize.transaction();

        try {
            const { address_id, note, voucher_code } = paymentData;
            const { cart, addressModel, voucherModel } =
                await validateAndSnapshotCart(userId, t);

            const address = await addressModel.findOne({
                where: { address_id, user_id: userId },
                transaction: t,
            });

            if (!address) {
                throw new AppError('Địa chỉ giao hàng không hợp lệ', 404);
            }

            const addressSnapshot = buildAddressSnapshot(address);

            let totalAmount = 0;
            const validatedItems = cart.items.map((item) => {
                const dish = item.dish;
                if (!dish || dish.status !== 'active' || !dish.available) {
                    throw new AppError(
                        `Món ăn '${dish?.name || 'không xác định'}' hiện không khả dụng`,
                        400,
                    );
                }
                if (dish.stock < item.quantity) {
                    throw new AppError(
                        `Món ăn '${dish.name}' không đủ số lượng trong kho`,
                        400,
                    );
                }

                const itemPrice = parseFloat(
                    item.priceSnapshot || item.price_snapshot || 0,
                );
                totalAmount += itemPrice * item.quantity;

                return {
                    dish_id: item.dishId || item.dish_id,
                    name: dish.name,
                    price: itemPrice,
                    quantity: item.quantity,
                    preparation_time: dish.preparation_time || 0,
                    brand: dish.brand || 'Eatsy',
                };
            });

            const brands = [
                ...new Set(validatedItems.map((item) => item.brand)),
            ];
            const orderBrand = brands.length === 1 ? brands[0] : 'Mixed Brands';

            let discountAmount = 0;
            let appliedVoucher = null;

            if (voucher_code) {
                const voucher = await voucherModel.findOne({
                    where: {
                        code: voucher_code,
                        valid_from: { [Op.lte]: new Date() },
                        valid_to: { [Op.gte]: new Date() },
                        number_of_uses: { [Op.gt]: 0 },
                    },
                    transaction: t,
                });

                if (!voucher) {
                    throw new AppError(
                        'Mã giảm giá không hợp lệ hoặc đã hết hạn',
                        400,
                    );
                }

                if (totalAmount < voucher.min_purchase) {
                    throw new AppError(
                        `Đơn hàng tối thiểu ${voucher.min_purchase.toLocaleString('vi-VN')}₫ để áp dụng mã này`,
                        400,
                    );
                }

                if (voucher.discount_type === 'Percentage') {
                    discountAmount = totalAmount * voucher.discount_value;
                } else {
                    discountAmount = Math.min(
                        voucher.discount_value,
                        totalAmount,
                    );
                }

                await voucher.decrement('number_of_uses', {
                    by: 1,
                    transaction: t,
                });

                appliedVoucher = {
                    voucher_id: voucher.voucher_id,
                    code: voucher.code,
                    discount_amount: discountAmount,
                };
            }

            const finalAmount = Math.max(0, totalAmount - discountAmount);
            const BASE_DELIVERY_MINUTES = 15;
            const maxPrepTime = Math.max(
                ...validatedItems.map((item) => item.preparation_time),
                0,
            );
            const estimatedTime = BASE_DELIVERY_MINUTES + maxPrepTime;

            const { bankCode, accountNo, accountName } = getVietQrConfig();
            const paymentId = uuidv4();
            const paymentCode = `PAY${Date.now()}`;

            const qrInfo = {
                bank_code: bankCode,
                account_no: accountNo,
                account_name: accountName,
                amount: Math.max(0, Math.round(finalAmount)),
                add_info: paymentCode,
                qr_url: buildVietQrImageUrl({
                    bankCode,
                    accountNo,
                    accountName,
                    amount: finalAmount,
                    addInfo: paymentCode,
                }),
            };

            await pendingPaymentModel.create(
                {
                    payment_id: paymentId,
                    user_id: userId,
                    address_id,
                    delivery_address: addressSnapshot,
                    note,
                    payment_method: 'BANK_TRANSFER',
                    payment_status: 'pending',
                    payment_code: paymentCode,
                    bank_code: bankCode,
                    account_no: accountNo,
                    account_name: accountName,
                    items_snapshot: validatedItems,
                    original_amount: totalAmount,
                    discount_amount: discountAmount,
                    total_amount: finalAmount,
                    voucher_code: appliedVoucher ? appliedVoucher.code : null,
                    brand: orderBrand,
                    estimated_time: estimatedTime,
                },
                { transaction: t },
            );

            await t.commit();

            return {
                payment_id: paymentId,
                payment_status: 'pending',
                total_amount: finalAmount,
                original_amount: totalAmount,
                discount_amount: discountAmount,
                voucher_applied: appliedVoucher ? appliedVoucher.code : null,
                brand: orderBrand,
                estimated_time: estimatedTime,
                qr_info: qrInfo,
            };
        } catch (error) {
            if (t) await t.rollback();
            throw error;
        }
    },

    confirmPendingPayment: async (paymentId) => {
        const t = await sequelize.transaction();

        try {
            const payment = await pendingPaymentModel.findOne({
                where: { payment_id: paymentId },
                transaction: t,
            });

            if (!payment) {
                throw new AppError('Không tìm thấy phiên thanh toán', 404);
            }

            if (payment.payment_status === 'paid') {
                const existingOrder = payment.order_id
                    ? await orderModel.findOne({
                          where: { order_id: payment.order_id },
                          transaction: t,
                      })
                    : null;
                await t.commit();
                return { order: existingOrder, payment_status: 'paid' };
            }

            const itemsSnapshot = Array.isArray(payment.items_snapshot)
                ? payment.items_snapshot
                : JSON.parse(payment.items_snapshot || '[]');

            if (!itemsSnapshot.length) {
                throw new AppError('Phiên thanh toán không hợp lệ', 400);
            }

            for (const item of itemsSnapshot) {
                const dish = await dishModel.findOne({
                    where: { dish_id: item.dish_id },
                    transaction: t,
                });
                if (!dish || dish.status !== 'active' || !dish.available) {
                    throw new AppError(
                        `Món ăn '${item.name}' hiện không khả dụng`,
                        400,
                    );
                }
                if (dish.stock < item.quantity) {
                    throw new AppError(
                        `Món ăn '${item.name}' không đủ số lượng trong kho`,
                        400,
                    );
                }
            }

            const orderId = uuidv4();

            await orderModel.create(
                {
                    order_id: orderId,
                    user_id: payment.user_id,
                    quantity: itemsSnapshot.reduce(
                        (acc, item) => acc + item.quantity,
                        0,
                    ),
                    foods: itemsSnapshot
                        .map((item) => `${item.name} x${item.quantity}`)
                        .join(', '),
                    brand: payment.brand || 'Eatsy',
                    estimated_time: payment.estimated_time,
                    order_note: payment.note,
                    order_status: 'pending',
                    address_id: payment.address_id,
                    payment_method: payment.payment_method,
                    payment_status: 'paid',
                    total_amount: payment.total_amount,
                    delivery_address: payment.delivery_address,
                    voucher_code: payment.voucher_code,
                    discount_amount: payment.discount_amount,
                },
                { transaction: t },
            );

            const orderItemsData = itemsSnapshot.map((item) => ({
                order_item_id: uuidv4(),
                order_id: orderId,
                dish_id: item.dish_id,
                name: item.name,
                price: item.price,
                quantity: item.quantity,
            }));

            await orderItemModel.bulkCreate(orderItemsData, { transaction: t });

            for (const item of itemsSnapshot) {
                await dishModel.decrement('stock', {
                    by: item.quantity,
                    where: { dish_id: item.dish_id },
                    transaction: t,
                });
            }

            const cart = await cartModel.findOne({
                where: { user_id: payment.user_id },
                transaction: t,
            });
            if (cart) {
                await cartItemModel.destroy({
                    where: { cart_id: cart.cart_id },
                    transaction: t,
                });
            }

            await payment.update(
                {
                    payment_status: 'paid',
                    paid_at: new Date(),
                    order_id: orderId,
                },
                { transaction: t },
            );

            await t.commit();

            return {
                order_id: orderId,
                payment_status: 'paid',
            };
        } catch (error) {
            if (t) await t.rollback();
            throw error;
        }
    },
};

module.exports = PaymentService;
