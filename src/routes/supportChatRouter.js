const express = require("express");
const router = express.Router();
const {
    getOrCreateConversation,
    getAllConversations,
    getMessages,
    sendMessage,
    closeConversation,
    reopenConversation,
    getMyConversation,
} = require("@controllers/supportChatController");
const { authAdminMiddleware } = require("@middlewares/authMiddleware");

// ────────────────────────────────────────────────────────────
// ROUTES DÙNG CHUNG (authMiddleware đã được gắn ở routes/index.js)
// ────────────────────────────────────────────────────────────

/**
 * [Customer] Lấy cuộc hội thoại đang mở của mình
 * Phải đặt trước /:id để tránh conflict
 */
router.get("/conversations/mine", getMyConversation);

/**
 * [Customer] Tạo hoặc lấy lại cuộc hội thoại đang mở
 */
router.post("/conversations", getOrCreateConversation);

/**
 * [Admin] Lấy danh sách toàn bộ cuộc hội thoại
 */
router.get("/conversations", authAdminMiddleware, getAllConversations);

/**
 * [Customer & Admin] Lấy lịch sử tin nhắn trong 1 cuộc hội thoại
 */
router.get("/conversations/:id/messages", getMessages);

/**
 * [Customer & Admin] Gửi tin nhắn
 */
router.post("/conversations/:id/messages", sendMessage);

/**
 * [Admin] Đóng cuộc hội thoại
 */
router.put("/conversations/:id/close", authAdminMiddleware, closeConversation);

/**
 * [Admin] Mở lại cuộc hội thoại
 */
router.put("/conversations/:id/reopen", authAdminMiddleware, reopenConversation);

module.exports = router;
