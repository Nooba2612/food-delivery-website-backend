const { DataTypes } = require("sequelize");
const { sequelize } = require("@core/config/sequelize");

const invoiceItemModel = sequelize.define(
  "InvoiceItem",
  {
    invoice_item_id: {
      type: DataTypes.STRING(255),
      primaryKey: true,
    },
    invoice_id: {
      type: DataTypes.STRING(255),
      allowNull: false,
      references: {
        model: "Invoices",
        key: "invoice_id",
      },
      onDelete: "CASCADE",
    },
    dish_id: {
      type: DataTypes.STRING(255),
      allowNull: false,
      references: {
        model: "Dishes",
        key: "dish_id",
      },
      onDelete: "CASCADE",
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      validate: {
        min: 1,
      },
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
  },
  {
    tableName: "InvoiceItems",
    timestamps: false,
    underscored: false,
  },
);

module.exports = invoiceItemModel;
