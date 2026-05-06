const { DataTypes } = require("sequelize");
const { sequelize } = require("@config/sequelize");

const ConversationNotificationSettings = sequelize.define(
    "ConversationNotificationSettings",
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
        mute_until: {
            type: DataTypes.DATE,
            allowNull: true,
            comment: "NULL means not muted (unless is_muted_forever=true)",
        },
        is_muted_forever: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
            allowNull: false,
        },
    },
    {
        tableName: "conversation_notification_settings",
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
        indexes: [
            {
                unique: true,
                fields: ["user_id", "conversation_id"],
                name: "uq_conv_notif_user_conv",
            },
        ],
    },
);

module.exports = ConversationNotificationSettings;
