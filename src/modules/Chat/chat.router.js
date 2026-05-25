const express = require("express");
const router = express.Router();

const chatController = require("./chat.controller");
const { authMiddleware } = require("@core/middlewares/authMiddleware");
const { messageUpload, conversationUpload } = require("@core/config/multer");

/**
 * @swagger
 * /api/conversations/{conversationId}:
 *   delete:
 *     summary: Delete (archive) a conversation
 *     description: Archive a conversation - hides it from user's conversation list
 *     tags:
 *       - Chat
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *         description: Conversation ID (UUID)
 *     responses:
 *       200:
 *         description: Conversation archived successfully
 *       403:
 *         description: User is not a member of this conversation
 *       404:
 *         description: Conversation not found
 *       401:
 *         description: Unauthorized - missing or invalid JWT token
 */
router.delete(
  "/:conversationId",
  authMiddleware,
  chatController.deleteConversation,
);

// Get user's conversations
/**
 * @swagger
 * /api/conversations:
 *   get:
 *     summary: Get user's conversations
 *     tags:
 *       - Chat - Conversations
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: number
 *           default: 20
 *         description: Number of conversations per page
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *         description: Pagination cursor
 *     responses:
 *       200:
 *         description: Conversations retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     conversations:
 *                       type: array
 *                       items:
 *                         type: object
 *                     hasMore:
 *                       type: boolean
 *                     nextCursor:
 *                       type: string
 *       401:
 *         description: Unauthorized
 */
router.get("/", authMiddleware, chatController.getConversations);

// Get conversations by userId
/**
 * @swagger
 * /api/conversations/user/{userId}:
 *   get:
 *     summary: Get conversations by userId
 *     tags:
 *       - Chat - Conversations
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID to get conversations
 *       - in: query
 *         name: limit
 *         schema:
 *           type: number
 *           default: 20
 *         description: Number of conversations per page
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *         description: Pagination cursor
 *     responses:
 *       200:
 *         description: Conversations retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     conversations:
 *                       type: array
 *                       items:
 *                         type: object
 *                     hasMore:
 *                       type: boolean
 *                     nextCursor:
 *                       type: string
 *       400:
 *         description: Invalid userId
 *       401:
 *         description: Unauthorized
 */
router.get(
  "/user/:userId",
  authMiddleware,
  chatController.getConversationsByUserId,
);

// Create 1-to-1 conversation
/**
 * @swagger
 * /api/conversations:
 *   post:
 *     summary: Create 1-to-1 conversation
 *     tags:
 *       - Chat - Conversations
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               participantId:
 *                 type: string
 *                 description: UUID of participant
 *     responses:
 *       200:
 *         description: Conversation created or found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     conversationId:
 *                       type: string
 *                     type:
 *                       type: string
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 */
router.post("/", authMiddleware, chatController.getOrCreateDirectConversation);

// Create group conversation
/**
 * @swagger
 * /api/conversations/group:
 *   post:
 *     summary: Create group conversation
 *     tags:
 *       - Chat - Conversations
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Group name
 *               participantIds:
 *                 type: string
 *                 description: JSON array of user UUIDs
 *               avatar:
 *                 type: string
 *                 format: binary
 *                 description: Group avatar image
 *     responses:
 *       201:
 *         description: Group created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     conversationId:
 *                       type: string
 *                     type:
 *                       type: string
 *                       enum: [group]
 *                     name:
 *                       type: string
 *                     avatarPath:
 *                       type: string
 *                     description:
 *                       type: string
 *                     createdBy:
 *                       type: string
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 */
router.post(
  "/group",
  authMiddleware,
  conversationUpload.single("avatar"),
  chatController.createGroupConversation,
);

// Get conversation details
/**
 * @swagger
 * /api/conversations/details:
 *   post:
 *     summary: Get conversation details
 *     tags:
 *       - Chat - Conversations
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               conversationId:
 *                 type: string
 *                 description: Conversation UUID
 *             required:
 *               - conversationId
 *     responses:
 *       200:
 *         description: Conversation details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     conversationId:
 *                       type: string
 *                     type:
 *                       type: string
 *                     name:
 *                       type: string
 *                     avatarPath:
 *                       type: string
 *                     description:
 *                       type: string
 *                     createdBy:
 *                       type: string
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                     participantDetails:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           userId:
 *                             type: string
 *                           username:
 *                             type: string
 *                           fullname:
 *                             type: string
 *                           avatarUrl:
 *                             type: string
 *                           role:
 *                             type: string
 *       400:
 *         description: Not a member or conversation not found
 *       401:
 *         description: Unauthorized
 */
router.post("/details", authMiddleware, chatController.getConversationDetails);

// Update conversation (name/avatar)
/**
 * @swagger
 * /api/conversations/{conversationId}:
 *   put:
 *     summary: Update conversation (name/avatar)
 *     tags:
 *       - Chat - Conversations
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               avatar:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Conversation updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     conversationId:
 *                       type: string
 *                     name:
 *                       type: string
 *                     avatarPath:
 *                       type: string
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Unauthorized
 */
router.put(
  "/:conversationId",
  authMiddleware,
  conversationUpload.single("avatar"),
  chatController.updateConversation,
);

// Update conversation settings (mute/pin)
/**
 * @swagger
 * /api/conversations/{conversationId}/settings:
 *   put:
 *     summary: Update conversation settings
 *     tags:
 *       - Chat - Conversations
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               isMuted:
 *                 type: boolean
 *               isPinned:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Settings updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 settings:
 *                   type: object
 *                   properties:
 *                     isMuted:
 *                       type: boolean
 *                     isPinned:
 *                       type: boolean
 *                     lastReadAt:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Unauthorized
 */
router.put(
  "/:conversationId/settings",
  authMiddleware,
  chatController.updateConversationSettings,
);

// Get messages in conversation
router.get(
  "/:conversationId/messages",
  authMiddleware,
  chatController.getMessages,
);

// Send message
/**
 * @swagger
 * /api/conversations/{conversationId}/messages:
 *   post:
 *     summary: Send message
 *     tags:
 *       - Chat - Messages
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *                 description: Message content
 *               type:
 *                 type: string
 *                 enum: [text, image, file]
 *                 default: text
 *               mentions:
 *                 type: string
 *                 description: JSON array of mentioned user IDs
 *               replyToId:
 *                 type: string
 *                 description: Message ID to reply to
 *               attachments:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       201:
 *         description: Message sent
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     messageId:
 *                       type: string
 *                     conversationId:
 *                       type: string
 *                     senderId:
 *                       type: string
 *                     content:
 *                       type: string
 *                     type:
 *                       type: string
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     senderDetails:
 *                       type: object
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 */
router.post(
  "/:conversationId/messages",
  authMiddleware,
  messageUpload.array("attachments"),
  chatController.sendMessage,
);

// Create call message bubble
/**
 * @swagger
 * /api/conversations/{conversationId}/call:
 *   post:
 *     summary: Create call message bubble
 *     description: Create a message bubble recording a call after it ends
 *     tags:
 *       - Chat - Messages
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *         description: Conversation ID (UUID)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               callId:
 *                 type: string
 *                 description: Call ID (UUID)
 *               callType:
 *                 type: string
 *                 enum: ['voice', 'video']
 *                 description: Type of call
 *               callStatus:
 *                 type: string
 *                 enum: ['accepted', 'cancelled', 'rejected', 'missed']
 *                 description: Status of the call
 *               durationSeconds:
 *                 type: number
 *                 description: Call duration in seconds
 *     responses:
 *       201:
 *         description: Call message created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Conversation not found
 */
router.post(
  "/:conversationId/call",
  authMiddleware,
  chatController.createCallMessage,
);

// Mark messages as read
/**
 * @swagger
 * /api/conversations/{conversationId}/messages/read:
 *   put:
 *     summary: Mark messages as read
 *     tags:
 *       - Chat - Messages
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               messageIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Messages marked as read
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 */
router.put(
  "/:conversationId/messages/read",
  authMiddleware,
  chatController.markMessagesAsRead,
);

// Edit message
/**
 * @swagger
 * /api/conversations/{conversationId}/messages/{messageId}:
 *   put:
 *     summary: Edit message
 *     tags:
 *       - Chat - Messages
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *     responses:
 *       200:
 *         description: Message updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     messageId:
 *                       type: string
 *                     content:
 *                       type: string
 *                     isEdited:
 *                       type: boolean
 *                     editedAt:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Unauthorized
 */
router.put(
  "/:conversationId/messages/:messageId",
  authMiddleware,
  chatController.editMessage,
);

// Delete message
/**
 * @swagger
 * /api/conversations/{conversationId}/messages/{messageId}:
 *   delete:
 *     summary: Delete message
 *     tags:
 *       - Chat - Messages
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Message deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     messageId:
 *                       type: string
 *                     deletedAt:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Unauthorized
 */
router.delete(
  "/:conversationId/messages/:messageId",
  authMiddleware,
  chatController.deleteMessage,
);

// Recall message (within 5 minutes)
/**
 * @swagger
 * /api/conversations/{conversationId}/messages/{messageId}/recall:
 *   put:
 *     summary: Recall a message (within 5 minutes)
 *     description: Sender can recall their message within 5 minutes of sending
 *     tags:
 *       - Chat - Messages
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Message recalled successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *       400:
 *         description: Message cannot be recalled (too old or not sender)
 *       404:
 *         description: Message not found
 *       401:
 *         description: Unauthorized
 */
router.put(
  "/:conversationId/messages/:messageId/recall",
  authMiddleware,
  chatController.recallMessage,
);

// Mark conversation as read
/**
 * @swagger
 * /api/conversations/{conversationId}/read:
 *   put:
 *     summary: Mark conversation as read
 *     tags:
 *       - Chat - Messages
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Conversation marked as read
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 */
router.put(
  "/:conversationId/read",
  authMiddleware,
  chatController.markConversationAsRead,
);

// Add reaction to message
/**
 * @swagger
 * /api/conversations/{conversationId}/messages/{messageId}/reaction:
 *   post:
 *     summary: Add reaction to message
 *     tags:
 *       - Chat - Messages
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               emoji:
 *                 type: string
 *                 description: Emoji character
 *     responses:
 *       200:
 *         description: Reaction added
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     messageId:
 *                       type: string
 *                     reactions:
 *                       type: array
 *                       items:
 *                         type: object
 *       401:
 *         description: Unauthorized
 */
router.post(
  "/:conversationId/messages/:messageId/reaction",
  authMiddleware,
  chatController.addReaction,
);

// Remove reaction from message
/**
 * @swagger
 * /api/conversations/{conversationId}/messages/{messageId}/reaction:
 *   delete:
 *     summary: Remove reaction from message
 *     tags:
 *       - Chat - Messages
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               emoji:
 *                 type: string
 *     responses:
 *       200:
 *         description: Reaction removed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     messageId:
 *                       type: string
 *                     reactions:
 *                       type: array
 *       401:
 *         description: Unauthorized
 */
router.delete(
  "/:conversationId/messages/:messageId/reaction",
  authMiddleware,
  chatController.removeReaction,
);

// Add member to group
/**
 * @swagger
 * /api/conversations/{conversationId}/members:
 *   post:
 *     summary: Add member to group
 *     tags:
 *       - Chat - Group Members
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               memberId:
 *                 type: string
 *                 description: User UUID to add
 *     responses:
 *       200:
 *         description: Member added
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       401:
 *         description: Unauthorized
 */
router.post(
  "/:conversationId/members",
  authMiddleware,
  chatController.addMemberToGroup,
);

// Remove member from group
/**
 * @swagger
 * /api/conversations/{conversationId}/members:
 *   delete:
 *     summary: Remove member from group
 *     tags:
 *       - Chat - Group Members
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               memberId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Member removed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       401:
 *         description: Unauthorized
 */
router.delete(
  "/:conversationId/members",
  authMiddleware,
  chatController.removeMemberFromGroup,
);

// Disband group
/**
 * @swagger
 * /api/conversations/{conversationId}/disband:
 *   delete:
 *     summary: Disband group
 *     tags:
 *       - Chat - Group
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Group disbanded
 */
router.delete(
  "/:conversationId/disband",
  authMiddleware,
  chatController.disbandGroup,
);

// Update member role
/**
 * @swagger
 * /api/conversations/{conversationId}/members/role:
 *   put:
 *     summary: Update member role
 *     tags:
 *       - Chat - Group Members
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               memberId:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [admin, member]
 *     responses:
 *       200:
 *         description: Role updated
 */
router.put(
  "/:conversationId/members/role",
  authMiddleware,
  chatController.updateMemberRole,
);

// Forward message
/**
 * @swagger
 * /api/conversations/{conversationId}/messages/forward:
 *   post:
 *     summary: Forward message
 *     tags:
 *       - Chat - Messages
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               originalConversationId:
 *                 type: string
 *               messageId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Message forwarded
 */
router.post(
  "/:conversationId/messages/forward",
  authMiddleware,
  chatController.forwardMessage,
);

module.exports = router;
