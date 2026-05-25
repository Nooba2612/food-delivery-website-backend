// Import models from their respective modules
const userModel = require("@modules/Auth/models/userModel");
const otpModel = require("@modules/Auth/models/otpModel");

const dishModel = require("@modules/Dish/models/dishModel");
const categoryModel = require("@modules/Dish/models/categoryModel");

const orderItemModel = require("@modules/Order/models/orderItemModel");
const cartItemModel = require("@modules/Cart/models/cartItemModel");
const orderModel = require("@modules/Order/models/orderModel");
const cartModel = require("@modules/Cart/models/cartModel");

const customerModel = require("@modules/User/models/customerModel");
const addressModel = require("@modules/User/models/addressModel");

const invoiceItemModel = require("@modules/Order/models/invoiceItemModel");
const invoiceModel = require("@modules/Order/models/invoiceModel");

const voucherModel = require("@modules/Voucher/models/voucherModel");
const accountVoucher = require("@modules/Voucher/models/userVoucher");

const reviewModel = require("@modules/Review/models/reviewModel");

const supportConversationModel = require("@modules/Chat/models/supportConversationModel");
const supportMessageModel = require("@modules/Chat/models/supportMessageModel");

module.exports = {
  userModel,
  cartItemModel,
  orderItemModel,
  orderModel,
  otpModel,
  reviewModel,
  dishModel,
  cartModel,
  categoryModel,
  customerModel,
  invoiceItemModel,
  invoiceModel,
  voucherModel,
  accountVoucher,
  addressModel,
  supportConversationModel,
  supportMessageModel,
};

// Define associations after all models loaded
userModel.hasMany(addressModel, { foreignKey: "user_id", as: "addresses" });
addressModel.belongsTo(userModel, { foreignKey: "user_id" });

// Order associations
userModel.hasMany(orderModel, { foreignKey: "user_id", as: "orders" });
orderModel.belongsTo(userModel, { foreignKey: "user_id", as: "user" });

orderModel.hasMany(orderItemModel, { foreignKey: "order_id", as: "items" });
orderItemModel.belongsTo(orderModel, { foreignKey: "order_id", as: "order" });

orderItemModel.belongsTo(dishModel, { foreignKey: "dish_id", as: "dish" });
dishModel.hasMany(orderItemModel, { foreignKey: "dish_id" });

// Cart associations
userModel.hasOne(cartModel, { foreignKey: "user_id", as: "cart" });
cartModel.belongsTo(userModel, { foreignKey: "user_id" });

cartModel.hasMany(cartItemModel, { foreignKey: "cart_id", as: "items" });
cartItemModel.belongsTo(cartModel, { foreignKey: "cart_id" });

cartItemModel.belongsTo(dishModel, { foreignKey: "dishId", as: "dish" });
dishModel.hasMany(cartItemModel, { foreignKey: "dishId" });

// Category ↔ Dish
dishModel.belongsTo(categoryModel, {
  foreignKey: "category_id",
  as: "category",
});
categoryModel.hasMany(dishModel, { foreignKey: "category_id", as: "dishes" });

// Review associations
reviewModel.belongsTo(userModel, {
  foreignKey: "user_id",
  targetKey: "userId",
  as: "user",
});
userModel.hasMany(reviewModel, {
  foreignKey: "user_id",
  sourceKey: "userId",
  as: "reviews",
});

reviewModel.belongsTo(dishModel, {
  foreignKey: "dish_id",
  targetKey: "dish_id",
  as: "dish",
});
dishModel.hasMany(reviewModel, {
  foreignKey: "dish_id",
  sourceKey: "dish_id",
  as: "reviews",
});

// Support Chat associations
// Một cuộc hội thoại có nhiều tin nhắn
supportConversationModel.hasMany(supportMessageModel, {
  foreignKey: "conversation_id",
  as: "messages",
});
supportMessageModel.belongsTo(supportConversationModel, {
  foreignKey: "conversation_id",
  as: "conversation",
});
// Cuộc hội thoại thuộc về một khách hàng (liên kết tới Users)
supportConversationModel.belongsTo(userModel, {
  foreignKey: "customer_id",
  as: "customer",
});
