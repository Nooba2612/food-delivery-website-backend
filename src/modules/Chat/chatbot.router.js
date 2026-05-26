/**
 * ============================================================
 *  CHATBOT ROUTER — chatbot.router.js
 * ============================================================
 *
 *  Defines routes for AI Chatbot:
 *    POST /api/chat  →  chatbotController.chat
 *
 *  This route does not require authentication (authMiddleware) so
 *  guest users can ask questions before registering.
 *  If protection is needed, add authMiddleware before the handler.
 * ============================================================
 */

const express = require("express");
const router = express.Router();
const { chat } = require("./chatbot.controller");

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
