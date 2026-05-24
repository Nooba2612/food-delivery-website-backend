const { DataTypes } = require("sequelize");
const { sequelize } = require("@config/sequelize");

const cartModel = sequelize.define(
    "Cart",
    {
        cart_id: {
            type: DataTypes.STRING(255),
            primaryKey: true,
        },
        user_id: {
            type: DataTypes.STRING(255),
            allowNull: false,
            unique: true,
            references: {
                model: "Users",
                key: "user_id",
            },
        },
    },
    {
        tableName: "Carts",
        timestamps: false,
        underscored: false,
    },
);

module.exports = cartModel;
