const express = require("express");
const router = express.Router();

const callController = require("./call.controller");
const { authMiddleware } = require("@core/middlewares/authMiddleware");

/**
 * @swagger
 * /api/calls:
 *   post:
 *     summary: Initiate a call
 *     tags:
 *       - Calls
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               recipientId:
 *                 type: string
 *                 description: User ID of the recipient
 *               conversationId:
 *                 type: string
 *                 description: Conversation ID
 *               callType:
 *                 type: string
 *                 enum: ['voice', 'video']
 *                 description: Type of call
 *     responses:
 *       201:
 *         description: Call initiated successfully
 *       400:
 *         description: Bad request
 */
router.post("/", callController.initiateCall);

/**
 * @swagger
 * /api/calls/active:
 *   get:
 *     summary: Get active calls for user
 *     tags:
 *       - Calls
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of active calls
 */
router.get("/active", authMiddleware, callController.getActiveCalls);

/**
 * @swagger
 * /api/calls/{callId}:
 *   get:
 *     summary: Get call details
 *     tags:
 *       - Calls
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: callId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Call details
 *       404:
 *         description: Call not found
 */
router.get("/:callId", authMiddleware, callController.getCallById);

/**
 * @swagger
 * /api/calls/{callId}/accept:
 *   post:
 *     summary: Accept a call
 *     tags:
 *       - Calls
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: callId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Call accepted
 */
router.post("/:callId/accept", authMiddleware, callController.acceptCall);

/**
 * @swagger
 * /api/calls/{callId}/reject:
 *   post:
 *     summary: Reject a call
 *     tags:
 *       - Calls
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: callId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 default: user_declined
 *     responses:
 *       200:
 *         description: Call rejected
 */
router.post("/:callId/reject", authMiddleware, callController.rejectCall);

/**
 * @swagger
 * /api/calls/{callId}/cancel:
 *   post:
 *     summary: Cancel a call (caller only, before acceptance)
 *     tags:
 *       - Calls
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: callId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Call cancelled
 *       403:
 *         description: Only call initiator can cancel
 */
router.post("/:callId/cancel", authMiddleware, callController.cancelCall);

/**
 * @swagger
 * /api/calls/{callId}/end:
 *   post:
 *     summary: End a call
 *     tags:
 *       - Calls
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: callId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Call ended
 */
router.post("/:callId/end", authMiddleware, callController.endCall);

/**
 * @swagger
 * /api/conversations/{conversationId}/calls:
 *   get:
 *     summary: Get call history for conversation
 *     tags:
 *       - Calls
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Call history
 */
router.get(
  "/:conversationId/history",
  authMiddleware,
  callController.getCallHistory,
);

/**
 * @swagger
 * /api/calls/group:
 *   post:
 *     summary: Initiate a group call
 *     tags:
 *       - Calls
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       201:
 *         description: Group call initiated successfully
 */
router.post("/group", authMiddleware, callController.initiateGroupCall);

/**
 * @swagger
 * /api/calls/{callId}/add-participant:
 *   post:
 *     summary: Add a participant to a group call
 *     tags:
 *       - Calls
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: callId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Participant added
 */
router.post(
  "/:callId/add-participant",
  authMiddleware,
  callController.addParticipant,
);

/**
 * @swagger
 * /api/calls/{callId}/remove-participant:
 *   post:
 *     summary: Remove a participant from a group call
 *     tags:
 *       - Calls
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: callId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Participant removed
 */
router.post(
  "/:callId/remove-participant",
  authMiddleware,
  callController.removeParticipant,
);

module.exports = router;
