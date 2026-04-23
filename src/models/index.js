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

// Category & Dish associations
categoryModel.hasMany(dishModel, { foreignKey: "category_id", as: "dishes" });
dishModel.belongsTo(categoryModel, { foreignKey: "category_id", as: "Category" });
