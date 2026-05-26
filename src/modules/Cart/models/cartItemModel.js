const { DataTypes } = require("sequelize");
const { sequelize } = require("@core/config/sequelize");

const cartItemModel = sequelize.define(
  "CartItem",
  {
    cart_item_id: {
      type: DataTypes.STRING(255),
      primaryKey: true,
    },
    dishId: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: "dish_id",
      references: {
        model: "Dishes",
        key: "dish_id",
      },
    },
    cart_id: {
      type: DataTypes.STRING(255),
      allowNull: false,
      references: {
        model: "Carts",
        key: "cart_id",
      },
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    priceSnapshot: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      field: "price_snapshot",
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
    tableName: "CartItems",
    timestamps: false,
    underscored: false,
  },
);

module.exports = cartItemModel;
