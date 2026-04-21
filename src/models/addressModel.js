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
    ward: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    city: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    country: {
      type: DataTypes.STRING(100),
      defaultValue: "Vietnam",
    },
    isDefault: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: "is_default",
    },
    fullAddress: {
      type: DataTypes.TEXT,
      field: "full_address",
    },
  },
  {
    tableName: "Addresses",
  },
);

module.exports = Address;
