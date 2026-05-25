const { DataTypes } = require("sequelize");
const { sequelize } = require("@core/config/sequelize");

const orderItemModel = sequelize.define(
  "OrderItem",
  {
    order_item_id: {
      type: DataTypes.STRING(255),
      primaryKey: true,
    },
    order_id: {
      type: DataTypes.STRING(255),
      allowNull: false,
      references: {
        model: "Orders",
        key: "order_id",
      },
      onDelete: "CASCADE",
    },
    dish_id: {
      type: DataTypes.STRING(255),
      allowNull: false,
      references: {
        model: "Dishes",
        key: "dish_id",
      },
      onDelete: "CASCADE",
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: "Snapshot of dish name at order time",
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      comment: "Snapshot of unit price at order time",
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      onUpdate: DataTypes.NOW,
    },
  },
  {
    tableName: "OrderItems",
    timestamps: false,
    underscored: false,
  },
);

module.exports = orderItemModel;
