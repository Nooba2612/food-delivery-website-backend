const { DataTypes } = require("sequelize");
const { sequelize } = require("@core/config/sequelize");

const invoiceModel = sequelize.define(
  "Invoice",
  {
    invoice_id: {
      type: DataTypes.STRING(255),
      primaryKey: true,
    },
    customer_id: {
      type: DataTypes.STRING(255),
      allowNull: false,
      references: {
        model: "Customers",
        key: "customer_id",
      },
      onDelete: "CASCADE",
    },
    employee_id: {
      type: DataTypes.STRING(255),
      allowNull: false,
      references: {
        model: "Users",
        key: "user_id",
      },
      onDelete: "CASCADE",
    },
    shipping_fee: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    discount_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    total_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    payment_method: {
      type: DataTypes.ENUM(
        "Credit Card",
        "Momo",
        "Zalo Pay",
        "Bank Transfer",
        "Cash",
      ),
      defaultValue: "Cash",
    },
    status: {
      type: DataTypes.ENUM("Paid", "Pending", "Cancelled"),
      defaultValue: "Pending",
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
    tableName: "Invoices",
    timestamps: false,
    underscored: false,
  },
);

module.exports = invoiceModel;
