const { DataTypes } = require("sequelize");
const { sequelize } = require("@core/config/sequelize");

/**
 * Model cho bảng SupportConversations
 * Lưu các cuộc hội thoại giữa khách hàng (Customer) và Admin
 */
const SupportConversation = sequelize.define(
  "SupportConversation",
  {
    // Khóa chính: UUID tự sinh
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    // ID của khách hàng tạo cuộc hội thoại
    customerId: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: "customer_id",
    },
    // ID của Admin phụ trách (nullable: chưa có admin xử lý)
    adminId: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: "admin_id",
    },
    // Tiêu đề cuộc hội thoại (có thể để null, sẽ dùng tên customer thay thế)
    subject: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    // Trạng thái: open (đang mở) | closed (đã đóng)
    status: {
      type: DataTypes.ENUM("open", "closed"),
      defaultValue: "open",
    },
    // Thời điểm tin nhắn cuối cùng được gửi (dùng để sort danh sách)
    lastMessageAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "last_message_at",
    },
    // Số tin nhắn chưa đọc của Admin
    unreadByAdmin: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: "unread_by_admin",
    },
    // Số tin nhắn chưa đọc của Customer
    unreadByCustomer: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: "unread_by_customer",
    },
  },
  {
    tableName: "SupportConversations",
    timestamps: true, // tự tạo createdAt, updatedAt
    underscored: false,
  },
);

module.exports = SupportConversation;
