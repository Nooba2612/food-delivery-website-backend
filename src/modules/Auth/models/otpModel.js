const { DataTypes } = require("sequelize");

const { sequelize } = require("@core/config/sequelize");

const otpModel = sequelize.define(
  "OTP",
  {
    otp_id: {
      type: DataTypes.STRING(255),
      primaryKey: true,
    },
    info: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    otp: {
      type: DataTypes.STRING(6),
      allowNull: false,
    },
    country_code: {
      type: DataTypes.STRING(10),
      allowNull: true,
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    tableName: "OTP",
    timestamps: false,
    underscored: false,
  },
);

module.exports = otpModel;
