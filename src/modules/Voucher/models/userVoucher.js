const { sequelize } = require("@core/config/sequelize");
const { DataTypes } = require("sequelize");

const UserVoucher = sequelize.define(
  "UserVoucher",
  {
    user_id: {
      type: DataTypes.CHAR(255),
      allowNull: false,
      primaryKey: true,
      references: {
        model: "Users",
        key: "user_id",
      },
    },
    voucher_id: {
      type: DataTypes.CHAR(255),
      allowNull: false,
      primaryKey: true,
      references: {
        model: "Vouchers",
        key: "voucher_id",
      },
    },
    used_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: "UserVoucher",
    timestamps: false,
  },
);

module.exports = UserVoucher;
