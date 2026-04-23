const { DataTypes } = require("sequelize");
const { sequelize } = require("@config/sequelize");
const User = require("@models/userModel");

const Address = sequelize.define(
  "Address",
  {
    addressId: {
      type: DataTypes.STRING(255),
      primaryKey: true,
      field: "address_id",
    },
    userId: {
      type: DataTypes.STRING(255),
      allowNull: false,
      references: {
        model: "Users",
        key: "user_id",
      },
      field: "user_id",
    },
    street: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    city: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    ward: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    label: {
      type: DataTypes.ENUM('Home', 'Work', 'Other'),
      defaultValue: "Home",
    },
    isDefault: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: "is_default",
    },
  },
  {
    tableName: "Addresses",
  },
);

module.exports = Address;
