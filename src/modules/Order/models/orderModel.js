const { DataTypes } = require("sequelize");
const { sequelize } = require("@core/config/sequelize");

const orderModel = sequelize.define(
  "Order",
  {
    order_id: {
      type: DataTypes.STRING(255),
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: "user_id",
      references: {
        model: "Users",
        key: "user_id",
      },
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    foods: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    brand: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: "Eatsy",
      comment: "Snapshot of brand at order creation time",
    },
    estimated_time: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
      comment: "Estimated delivery time in minutes",
    },
    order_note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    order_status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "pending",
      validate: {
        isIn: [
          ["pending", "confirmed", "delivering", "delivered", "cancelled"],
        ],
      },
    },
    address_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    payment_method: {
      type: DataTypes.STRING(100),
      allowNull: true,
      defaultValue: "Cash",
    },
    delivery_address: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    total_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },
    payment_status: {
      type: DataTypes.ENUM("unpaid", "paid"),
      allowNull: false,
      defaultValue: "unpaid",
    },
    voucher_code: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: "Applied voucher code for this order",
    },
    discount_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
      comment: "Discount amount from voucher",
    },
    order_date: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "Orders",
    timestamps: false,
    underscored: false,
  },
);

module.exports = orderModel;
