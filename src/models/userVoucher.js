const { DataTypes } = require("sequelize");
const { sequelize } = require("@config/sequelize");

const UserVoucher = sequelize.define(
  "UserVoucher",
  {
    account_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      references: {
        model: "Users",
        key: "user_id",
      },
    },
    voucher_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      references: {
        model: "Vouchers",
        key: "voucher_id",
      },
    },
    used_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "UserVoucher",
    timestamps: false,
  },
);

module.exports = UserVoucher;
