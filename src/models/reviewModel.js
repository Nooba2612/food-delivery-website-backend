const { DataTypes } = require("sequelize");
const { sequelize } = require("@config/sequelize");

const reviewModel = sequelize.define(
    "Review",
    {
        review_id: {
            type: DataTypes.STRING(255),
            primaryKey: true,
        },
        user_id: {
            type: DataTypes.STRING(255),
            allowNull: false,
            references: {
                model: "Users",
                key: "user_id",
            },
        },
        dish_id: {
            type: DataTypes.STRING(255),
            allowNull: false,
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
        tableName: "Reviews",
        timestamps: false,
        underscored: false,
    },
);

module.exports = reviewModel;
