const { DataTypes } = require("sequelize");
const { sequelize } = require("@core/config/sequelize");

const dishModel = sequelize.define(
  "Dish",
  {
    dish_id: {
      type: DataTypes.STRING(255),
      primaryKey: true,
    },
    category_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
      references: {
        model: "Categories",
        key: "category_id",
      },
      onDelete: "CASCADE",
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    brand: {
      type: DataTypes.STRING(100),
      allowNull: true,
      defaultValue: null,
      comment: "Fast-food brand name (KFC, Highlands Coffee, etc.)",
    },
    slug: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    thumbnail_path: {
      type: DataTypes.STRING(1000),
      allowNull: false,
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    discount_amount: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 0,
    },
    stock: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    sold_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    rating_avg: {
      type: DataTypes.DECIMAL(2, 1),
      defaultValue: 0,
      validate: {
        min: 0,
        max: 5,
      },
    },
    rating_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      validate: {
        min: 0,
      },
    },
    available: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    is_featured: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    status: {
      type: DataTypes.ENUM("draft", "active", "inactive"),
      defaultValue: "active",
    },
    preparation_time: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    calories: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    tags: {
      type: DataTypes.JSON,
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
    tableName: "Dishes",
    timestamps: false,
    underscored: false,
  },
);

module.exports = dishModel;
