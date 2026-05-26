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
} = require("./support.controller");
const { authAdminMiddleware } = require("@core/middlewares/authMiddleware");

// ────────────────────────────────────────────────────────────
// SHARED ROUTES (authMiddleware is attached in routes/index.js)
// ────────────────────────────────────────────────────────────

/**
 * [Customer] Get own open conversation
 * Must be placed before /:id to avoid conflict
 */
router.get("/conversations/mine", getMyConversation);

/**
 * [Customer] Create or retrieve an open conversation
 */
router.post("/conversations", getOrCreateConversation);

/**
 * [Admin] Get all conversations
 */
router.get("/conversations", authAdminMiddleware, getAllConversations);

/**
 * [Customer & Admin] Get message history for a conversation
 */
router.get("/conversations/:id/messages", getMessages);

/**
 * [Customer & Admin] Send a message
 */
router.post("/conversations/:id/messages", sendMessage);

/**
 * [Admin] Close a conversation
 */
router.put("/conversations/:id/close", authAdminMiddleware, closeConversation);

/**
 * [Admin] Reopen a conversation
 */
router.put(
  "/conversations/:id/reopen",
  authAdminMiddleware,
  reopenConversation,
);

module.exports = router;
