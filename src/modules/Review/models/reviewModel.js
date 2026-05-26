const { sequelize } = require("@core/config/sequelize");
const { DataTypes } = require("sequelize");

const reviewModel = sequelize.define(
  "Review",
  {
    review_id: {
      type: DataTypes.CHAR(36),
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    user_id: {
      type: DataTypes.CHAR(36),
      allowNull: true,
      references: {
        model: "Users",
        key: "user_id",
      },
    },
    dish_id: {
      type: DataTypes.CHAR(36),
      allowNull: true,
      references: {
        model: "Dishes",
        key: "dish_id",
      },
    },
    points: {
      type: DataTypes.DECIMAL(2, 1),
      allowNull: false,
      validate: {
        min: 0,
        max: 5,
      },
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    tableName: "Reviews",
    timestamps: false,
  },
);

module.exports = reviewModel;
