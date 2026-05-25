const { sequelize } = require("@core/config/sequelize");
const { DataTypes } = require("sequelize");

const voucherModel = sequelize.define(
  "Voucher",
  {
    voucher_id: {
      type: DataTypes.CHAR(36),
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    code: { type: DataTypes.STRING, allowNull: false, unique: true },
    description: { type: DataTypes.TEXT },
    discount_type: {
      type: DataTypes.ENUM("Percentage", "Amount"),
      allowNull: false,
    },
    discount_value: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    valid_from: { type: DataTypes.DATE, allowNull: false },
    valid_to: { type: DataTypes.DATE, allowNull: false },
    min_purchase: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
    number_of_uses: { type: DataTypes.INTEGER, defaultValue: 0 },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    tableName: "Vouchers",
    timestamps: false,
  },
);

module.exports = voucherModel;
