const { DataTypes } = require("sequelize");
const { sequelize } = require("@config/sequelize");

const ConversationSettings = sequelize.define(
    "ConversationSettings",
    {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        user_id: {
            type: DataTypes.CHAR(36),
            allowNull: false,
        },
        conversation_id: {
            type: DataTypes.STRING(36),
            allowNull: false,
            comment: "DynamoDB conversation_id (UUID)",
        },
        theme_type: {
            type: DataTypes.ENUM("default", "dark", "gradient", "color", "image"),
            defaultValue: "default",
            allowNull: false,
        },
        background_color: {
            type: DataTypes.STRING(50),
            allowNull: true,
        },
        background_image: {
            type: DataTypes.STRING(1000),
            allowNull: true,
        },
        gradient_start: {
            type: DataTypes.STRING(50),
            allowNull: true,
        },
        gradient_end: {
            type: DataTypes.STRING(50),
            allowNull: true,
        },
    },
    {
        tableName: "conversation_settings",
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
        indexes: [
            {
                unique: true,
                fields: ["user_id", "conversation_id"],
                name: "uq_conv_settings_user_conv",
            },
        ],
    },
);

module.exports = ConversationSettings;
