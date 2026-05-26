const { Op } = require("sequelize");
const supportConversationModel = require("./models/supportConversationModel");
const supportMessageModel = require("./models/supportMessageModel");
const authUserService = require("@modules/Auth/user.service");
const catchAsync = require("@core/utils/catchAsync");
const AppError = require("@core/utils/AppError");

const buildCustomerPayload = (user) =>
  user
    ? {
        userId: user.userId || user.user_id,
        fullname: user.fullname,
        username: user.username,
        avatarPath: user.avatarPath || user.avatar_path || null,
        email: user.email,
        phoneNumber: user.phoneNumber,
      }
    : null;

const enrichConversation = async (conversation) => {
  const plain = conversation?.toJSON ? conversation.toJSON() : conversation;
  const customer = await authUserService.getUserById(plain.customerId);
  return {
    ...plain,
    customer: buildCustomerPayload(customer),
  };
};

/**
 * [Customer] Create or retrieve an open conversation for the Customer.
 * Each Customer can only have 1 open conversation at a time.
 * POST /api/support/conversations
 */
const getOrCreateConversation = catchAsync(async (req, res, next) => {
  const customerId = req.user.user_id;
  const { subject } = req.body;

  // Find existing open conversation for this customer
  let conversation = await supportConversationModel.findOne({
    where: { customerId, status: "open" },
  });

  // If none exists, create a new one
  if (!conversation) {
    conversation = await supportConversationModel.create({
      customerId,
      subject: subject || "Hỗ trợ khách hàng",
      status: "open",
      lastMessageAt: new Date(),
    });

    // Reload to include customer info
    conversation = await supportConversationModel.findByPk(conversation.id);
  }

  res.status(200).json({
    success: true,
    data: await enrichConversation(conversation),
  });
});

/**
 * [Admin] Get all conversations, sorted by latest message.
 * GET /api/support/conversations
 */
const getAllConversations = catchAsync(async (req, res, next) => {
  const { status = "all", page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  // Build search conditions
  const where = {};
  if (status !== "all") {
    where.status = status; // 'open' or 'closed'
  }

  const { rows, count } = await supportConversationModel.findAndCountAll({
    where,
    // Sort by latest message time, newest first
    order: [["lastMessageAt", "DESC"]],
    limit: parseInt(limit),
    offset,
  });

  const conversations = await Promise.all(rows.map(enrichConversation));

  res.status(200).json({
    success: true,
    data: {
      conversations,
      total: count,
      page: parseInt(page),
      limit: parseInt(limit),
    },
  });
});

/**
 * [Customer & Admin] Get message history for a conversation.
 * GET /api/support/conversations/:id/messages
 */
const getMessages = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  // Check conversation exists
  const conversation = await supportConversationModel.findByPk(id);
  if (!conversation) {
    return next(new AppError("Không tìm thấy cuộc hội thoại", 404));
  }

  // Check permissions: Customer can only view their own, Admin can view all
  const userId = req.user.user_id;
  const userRole = req.user.role;
  if (userRole !== "Admin" && conversation.customerId !== userId) {
    return next(new AppError("Bạn không có quyền xem cuộc hội thoại này", 403));
  }

  const { rows, count } = await supportMessageModel.findAndCountAll({
    where: { conversationId: id },
    order: [["createdAt", "ASC"]], // Oldest first
    limit: parseInt(limit),
    offset,
  });

  // Mark messages as read for the other side
  if (userRole === "Admin") {
    // Admin reads → mark Customer messages as read
    await supportMessageModel.update(
      { isRead: true },
      { where: { conversationId: id, senderRole: "Customer", isRead: false } },
    );
    // Reset unread counter for Admin
    await supportConversationModel.update(
      { unreadByAdmin: 0 },
      { where: { id } },
    );
  } else {
    // Customer reads → mark Admin messages as read
    await supportMessageModel.update(
      { isRead: true },
      { where: { conversationId: id, senderRole: "Admin", isRead: false } },
    );
    // Reset unread counter for Customer
    await supportConversationModel.update(
      { unreadByCustomer: 0 },
      { where: { id } },
    );
  }

  res.status(200).json({
    success: true,
    data: {
      messages: rows,
      total: count,
      page: parseInt(page),
      limit: parseInt(limit),
    },
  });
});

/**
 * [Customer & Admin] Send a message to the conversation.
 * POST /api/support/conversations/:id/messages
 */
const sendMessage = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { content } = req.body;
  const userId = req.user.user_id;
  const userRole = req.user.role; // 'Admin' or 'Customer'
  const io = req.app.get("io");

  if (!content || content.trim() === "") {
    return next(new AppError("Nội dung tin nhắn không được trống", 400));
  }

  // Check conversation
  const conversation = await supportConversationModel.findByPk(id);
  if (!conversation) {
    return next(new AppError("Không tìm thấy cuộc hội thoại", 404));
  }

  if (conversation.status === "closed") {
    return next(
      new AppError("Cuộc hội thoại đã đóng, không thể gửi thêm tin nhắn", 400),
    );
  }

  // Determine senderRole
  const senderRole = userRole === "Admin" ? "Admin" : "Customer";

  // Save message to DB
  const message = await supportMessageModel.create({
    conversationId: id,
    senderId: userId,
    senderRole,
    content: content.trim(),
    isRead: false,
  });

  // Update lastMessageAt, unread counter for the other side
  const updateData = { lastMessageAt: new Date() };
  if (senderRole === "Customer") {
    updateData.unreadByAdmin = conversation.unreadByAdmin + 1;
  } else {
    updateData.unreadByCustomer = conversation.unreadByCustomer + 1;
  }
  await conversation.update(updateData);

  // Send real-time Socket event to the conversation room
  if (io) {
    const roomName = `support_conv_${id}`;
    io.to(roomName).emit("support:new_message", {
      ...message.toJSON(),
      conversationId: id,
    });

    // Notify Admin: update conversation list (new message badge)
    io.emit("support:conversation_updated", {
      conversationId: id,
      customerId: conversation.customerId,
      lastMessage: {
        content: content.trim(),
        senderRole,
        createdAt: message.createdAt,
      },
      unreadByAdmin: updateData.unreadByAdmin || conversation.unreadByAdmin,
    });
  }

  res.status(201).json({
    success: true,
    data: message,
  });
});

/**
 * [Admin] Close a conversation.
 * PUT /api/support/conversations/:id/close
 */
const closeConversation = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  const conversation = await supportConversationModel.findByPk(id);
  if (!conversation) {
    return next(new AppError("Không tìm thấy cuộc hội thoại", 404));
  }

  await conversation.update({ status: "closed" });

  const io = req.app.get("io");
  if (io) {
    const roomName = `support_conv_${id}`;
    // Notify Customer that the conversation has been closed
    io.to(roomName).emit("support:conversation_closed", {
      conversationId: id,
      closedAt: new Date().toISOString(),
    });
  }

  res.status(200).json({
    success: true,
    message: "Đã đóng cuộc hội thoại",
  });
});

/**
 * [Admin] Reopen a conversation.
 * PUT /api/support/conversations/:id/reopen
 */
const reopenConversation = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  const conversation = await supportConversationModel.findByPk(id);
  if (!conversation) {
    return next(new AppError("Không tìm thấy cuộc hội thoại", 404));
  }

  await conversation.update({ status: "open", lastMessageAt: new Date() });

  const io = req.app.get("io");
  if (io) {
    const roomName = `support_conv_${id}`;
    // Notify Customer that the conversation has been reopened
    io.to(roomName).emit("support:conversation_reopened", {
      conversationId: id,
      reopenedAt: new Date().toISOString(),
    });

    // Notify other Admins
    io.emit("support:conversation_updated", {
      conversationId: id,
      lastMessage: { content: "🟢 Cuộc hội thoại đã mở lại" },
      unreadByAdmin: conversation.unreadByAdmin,
    });
  }

  res.status(200).json({
    success: true,
    message: "Đã mở lại cuộc hội thoại",
  });
});

/**
 * [Customer] Get own open conversation (if any).
 * GET /api/support/conversations/mine
 */
const getMyConversation = catchAsync(async (req, res, next) => {
  const customerId = req.user.user_id;

  const conversation = await supportConversationModel.findOne({
    where: { customerId, status: "open" },
  });

  res.status(200).json({
    success: true,
    data: conversation ? await enrichConversation(conversation) : null,
  });
});

module.exports = {
  getOrCreateConversation,
  getAllConversations,
  getMessages,
  sendMessage,
  closeConversation,
  reopenConversation,
  getMyConversation,
};
