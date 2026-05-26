const { DataTypes } = require("sequelize");
const { sequelize } = require("@core/config/sequelize");

const customerModel = sequelize.define(
  "Customer",
  {
    customer_id: {
      type: DataTypes.STRING(255),
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
      references: {
        model: "Users",
        key: "user_id",
      },
    },
    loyal_points: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: {
        min: 0,
      },
    },
  },
  {
    tableName: "Customers",
    timestamps: false,
    underscored: false,
  },
);

module.exports = customerModel;
