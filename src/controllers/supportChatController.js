const { Op } = require("sequelize");
const { supportConversationModel, supportMessageModel, userModel } = require("@models");
const catchAsync = require("@utils/catchAsync");
const AppError = require("@utils/AppError");

/**
 * [Customer] Tạo hoặc lấy lại cuộc hội thoại đang mở của Customer.
 * Mỗi Customer chỉ có 1 cuộc hội thoại đang mở tại một thời điểm.
 * POST /api/support/conversations
 */
const getOrCreateConversation = catchAsync(async (req, res, next) => {
    const customerId = req.user.user_id;
    const { subject } = req.body;

    // Tìm cuộc hội thoại đang mở của customer này
    let conversation = await supportConversationModel.findOne({
        where: { customerId, status: "open" },
        include: [
            {
                model: userModel,
                as: "customer",
                attributes: ["userId", "fullname", "username", "avatarPath"],
            },
        ],
    });

    // Nếu chưa có thì tạo mới
    if (!conversation) {
        conversation = await supportConversationModel.create({
            customerId,
            subject: subject || "Hỗ trợ khách hàng",
            status: "open",
            lastMessageAt: new Date(),
        });

        // Reload lại để có thêm thông tin customer
        conversation = await supportConversationModel.findByPk(conversation.id, {
            include: [
                {
                    model: userModel,
                    as: "customer",
                    attributes: ["userId", "fullname", "username", "avatarPath"],
                },
            ],
        });
    }

    res.status(200).json({
        success: true,
        data: conversation,
    });
});

/**
 * [Admin] Lấy danh sách tất cả cuộc hội thoại, sắp xếp theo tin nhắn mới nhất.
 * GET /api/support/conversations
 */
const getAllConversations = catchAsync(async (req, res, next) => {
    const { status = "all", page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Build điều kiện tìm kiếm
    const where = {};
    if (status !== "all") {
        where.status = status; // 'open' hoặc 'closed'
    }

    const { rows, count } = await supportConversationModel.findAndCountAll({
        where,
        include: [
            {
                model: userModel,
                as: "customer",
                attributes: ["userId", "fullname", "username", "avatarPath", "email", "phoneNumber"],
            },
        ],
        // Sắp xếp theo thời gian tin nhắn cuối, mới nhất lên đầu
        order: [["lastMessageAt", "DESC"]],
        limit: parseInt(limit),
        offset,
    });

    res.status(200).json({
        success: true,
        data: {
            conversations: rows,
            total: count,
            page: parseInt(page),
            limit: parseInt(limit),
        },
    });
});

/**
 * [Customer & Admin] Lấy lịch sử tin nhắn của 1 cuộc hội thoại.
 * GET /api/support/conversations/:id/messages
 */
const getMessages = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Kiểm tra conversation tồn tại
    const conversation = await supportConversationModel.findByPk(id);
    if (!conversation) {
        return next(new AppError("Không tìm thấy cuộc hội thoại", 404));
    }

    // Kiểm tra quyền: Customer chỉ xem conversation của mình, Admin xem tất cả
    const userId = req.user.user_id;
    const userRole = req.user.role;
    if (userRole !== "Admin" && conversation.customerId !== userId) {
        return next(new AppError("Bạn không có quyền xem cuộc hội thoại này", 403));
    }

    const { rows, count } = await supportMessageModel.findAndCountAll({
        where: { conversationId: id },
        order: [["createdAt", "ASC"]], // Cũ nhất lên đầu
        limit: parseInt(limit),
        offset,
    });

    // Đánh dấu tin nhắn đã đọc cho bên kia
    if (userRole === "Admin") {
        // Admin đọc → đánh dấu các tin của Customer là đã đọc
        await supportMessageModel.update(
            { isRead: true },
            { where: { conversationId: id, senderRole: "Customer", isRead: false } }
        );
        // Reset unread counter cho Admin
        await supportConversationModel.update({ unreadByAdmin: 0 }, { where: { id } });
    } else {
        // Customer đọc → đánh dấu tin của Admin là đã đọc
        await supportMessageModel.update(
            { isRead: true },
            { where: { conversationId: id, senderRole: "Admin", isRead: false } }
        );
        // Reset unread counter cho Customer
        await supportConversationModel.update({ unreadByCustomer: 0 }, { where: { id } });
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
 * [Customer & Admin] Gửi tin nhắn vào cuộc hội thoại.
 * POST /api/support/conversations/:id/messages
 */
const sendMessage = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    const { content } = req.body;
    const userId = req.user.user_id;
    const userRole = req.user.role; // 'Admin' hoặc 'Customer'
    const io = req.app.get("io");

    if (!content || content.trim() === "") {
        return next(new AppError("Nội dung tin nhắn không được trống", 400));
    }

    // Kiểm tra conversation
    const conversation = await supportConversationModel.findByPk(id);
    if (!conversation) {
        return next(new AppError("Không tìm thấy cuộc hội thoại", 404));
    }

    if (conversation.status === "closed") {
        return next(new AppError("Cuộc hội thoại đã đóng, không thể gửi thêm tin nhắn", 400));
    }

    // Xác định senderRole
    const senderRole = userRole === "Admin" ? "Admin" : "Customer";

    // Lưu tin nhắn vào DB
    const message = await supportMessageModel.create({
        conversationId: id,
        senderId: userId,
        senderRole,
        content: content.trim(),
        isRead: false,
    });

    // Cập nhật lastMessageAt, unread counter cho bên còn lại
    const updateData = { lastMessageAt: new Date() };
    if (senderRole === "Customer") {
        updateData.unreadByAdmin = conversation.unreadByAdmin + 1;
        // Nếu chưa có admin nào nhận, gán admin_id tự động từ cấu hình
        // (optional: để null và Admin sẽ thấy tất cả)
    } else {
        updateData.unreadByCustomer = conversation.unreadByCustomer + 1;
    }
    await conversation.update(updateData);

    // Gửi sự kiện Socket real-time tới room của cuộc hội thoại
    if (io) {
        const roomName = `support_conv_${id}`;
        io.to(roomName).emit("support:new_message", {
            ...message.toJSON(),
            conversationId: id,
        });

        // Notify Admin: cập nhật danh sách conversation (badge tin nhắn mới)
        // emit tới tất cả Admin đang online
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
 * [Admin] Đóng cuộc hội thoại.
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
        // Thông báo Customer biết cuộc hội thoại đã được đóng
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
 * [Admin] Mở lại cuộc hội thoại.
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
        // Thông báo cho Customer biết cuộc trò chuyện đã mở lại
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
 * [Customer] Lấy cuộc hội thoại đang mở của chính mình (nếu có).
 * GET /api/support/conversations/mine
 */
const getMyConversation = catchAsync(async (req, res, next) => {
    const customerId = req.user.user_id;

    const conversation = await supportConversationModel.findOne({
        where: { customerId, status: "open" },
    });

    res.status(200).json({
        success: true,
        data: conversation, // null nếu chưa có
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
