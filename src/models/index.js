const { sequelize } = require("@config/sequelize");

const userModel = require("@models/userModel");
const dishModel = require("@models/dishModel");
const orderItemModel = require("@models/orderItemModel");
const cartItemModel = require("@models/cartItemModel");
const orderModel = require("@models/orderModel");
const cartModel = require("@models/cartModel");
const categoryModel = require("@models/categoryModel");
const customerModel = require("@models/customerModel");
const invoiceItemModel = require("@models/invoiceItemModel");
const invoiceModel = require("@models/invoiceModel");
const voucherModel = require("@models/voucherModel");
const otpModel = require("@models/otpModel");
const reviewModel = require("@models/reviewModel");
const accountVoucher = require("@models/userVoucher");
const addressModel = require("@models/addressModel");
const supportConversationModel = require("@models/supportConversationModel");
const supportMessageModel = require("@models/supportMessageModel");

sequelize
  .sync()
  .then(() => {
    console.log("\n\nTables have been created\n\n");
  })
  .catch((error) => console.log("\n\nThis error occurred", error + "\n\n"));

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
userModel.hasMany(orderModel, { foreignKey: "account_id", as: "orders" });
orderModel.belongsTo(userModel, { foreignKey: "account_id", as: "user" });

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
dishModel.belongsTo(categoryModel, { foreignKey: "category_id", as: "category" });
categoryModel.hasMany(dishModel, { foreignKey: "category_id", as: "dishes" });

// Review associations
reviewModel.belongsTo(userModel, { 
    foreignKey: "user_id", 
    targetKey: "userId",
    as: "user" 
});
userModel.hasMany(reviewModel, { 
    foreignKey: "user_id", 
    sourceKey: "userId",
    as: "reviews" 
});

reviewModel.belongsTo(dishModel, { 
    foreignKey: "dish_id", 
    targetKey: "dish_id",
    as: "dish" 
});
dishModel.hasMany(reviewModel, { 
    foreignKey: "dish_id", 
    sourceKey: "dish_id",
    as: "reviews" 
});

// Support Chat associations
// Một cuộc hội thoại có nhiều tin nhắn
supportConversationModel.hasMany(supportMessageModel, { foreignKey: "conversation_id", as: "messages" });
supportMessageModel.belongsTo(supportConversationModel, { foreignKey: "conversation_id", as: "conversation" });
// Cuộc hội thoại thuộc về một khách hàng (liên kết tới Users)
supportConversationModel.belongsTo(userModel, { foreignKey: "customer_id", as: "customer" });
