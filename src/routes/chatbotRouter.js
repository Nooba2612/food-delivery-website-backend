/**
 * ============================================================
 *  CHATBOT ROUTER — chatbotRouter.js
 * ============================================================
 *
 *  Định nghĩa route cho AI Chatbot:
 *    POST /api/chat  →  chatbotController.chat
 *
 *  Route này không yêu cầu xác thực (authMiddleware) để
 *  guest user cũng có thể hỏi thăm trước khi đăng ký.
 *  Nếu cần bảo vệ, thêm authMiddleware vào trước handler.
 * ============================================================
 */

const express = require("express");
const router = express.Router();
const { chat } = require("@controllers/chatbotController");

/**
 * POST /api/chat
 *
 * Body (application/json):
 *   {
 *     "message": "Tôi muốn ăn gì hôm nay nhỉ?",
 *     "chatHistory": [
 *       { "role": "user", "content": "Xin chào" },
 *       { "role": "assistant", "content": "Xin chào! Tôi có thể giúp gì cho bạn?" }
 *     ]
 *   }
 */
router.post("/", chat);

module.exports = router;
