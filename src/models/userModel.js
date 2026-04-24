const { DataTypes } = require("sequelize");
const { sequelize } = require("@config/sequelize");

const User = sequelize.define(
  "User",
  {
    userId: {
      type: DataTypes.STRING(255),
      primaryKey: true,
      field: "user_id",
    },
    fullname: DataTypes.STRING(255),
    gender: DataTypes.ENUM("Male", "Female", "Other"),
    dateOfBirth: {
      type: DataTypes.DATE,
      field: "date_of_birth",
    },
    password: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    username: DataTypes.STRING(255),
    typeLogin: {
      type: DataTypes.ENUM("Standard", "Google", "Facebook", "Apple"),
      allowNull: false,
      defaultValue: "Standard",
      field: "type_login",
    },
    email: {
      type: DataTypes.STRING(255),
      unique: true,
    },
    phoneNumber: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: true,
      field: "phone_number",
    },
    countryCode: {
      type: DataTypes.STRING(10),
      allowNull: false,
      field: "country_code",
    },
    role: {
      type: DataTypes.ENUM("Admin", "Customer", "Owner", "Employee"),
      defaultValue: "Customer",
    },
    avatarPath: {
      type: DataTypes.STRING(1000),
      field: "avatar_path",
    },
    paymentMethodId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "payment_method_id",
    },
    lastLogin: {
      type: DataTypes.DATE,
      field: "last_login",
    },
    isOnline: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: "is_online",
    },
  },
  {
    tableName: "Users",
  },
);

// Remove circular dependency - associations handled in index.js
module.exports = User;
