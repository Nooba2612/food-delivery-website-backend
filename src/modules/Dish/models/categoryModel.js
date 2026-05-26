const { DataTypes } = require("sequelize");
const { sequelize } = require("@core/config/sequelize");

const categoryModel = sequelize.define(
  "Category",
  {
    category_id: {
      type: DataTypes.STRING(255),
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
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
    tableName: "Categories",
    timestamps: false,
    underscored: false,
  },
);

module.exports = categoryModel;
