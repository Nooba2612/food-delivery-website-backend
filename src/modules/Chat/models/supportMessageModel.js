const { DataTypes } = require("sequelize");
const { sequelize } = require("@core/config/sequelize");

/**
 * Model cho bảng SupportMessages
 * Lưu từng tin nhắn trong cuộc hội thoại hỗ trợ
 */
const SupportMessage = sequelize.define(
  "SupportMessage",
  {
    // Khóa chính: UUID tự sinh
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    // Thuộc conversation nào
    conversationId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: "conversation_id",
    },
    // Người gửi
    senderId: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: "sender_id",
    },
    // Vai trò người gửi: Admin hoặc Customer
    senderRole: {
      type: DataTypes.ENUM("Admin", "Customer"),
      allowNull: false,
      field: "sender_role",
    },
    // Nội dung tin nhắn
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    // Trạng thái đã đọc
    isRead: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: "is_read",
    },
  },
  {
    tableName: "SupportMessages",
    timestamps: true, // tự tạo createdAt, updatedAt
    underscored: false,
  },
);

module.exports = SupportMessage;
