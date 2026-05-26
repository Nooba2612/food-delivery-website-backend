const CallService = require("./call.service");
const ConversationModel = require("./models/conversationModel");
const CallModel = require("./models/callModel");
const { getUserById } = require("@modules/User/user.service");

/**
 * Initiate a call
 * POST /api/calls
 */
const initiateCall = async (req, res) => {
  try {
    console.log("🔴 [ENTER initiateCall] - Request received!");
    console.log("🔴 Headers:", req.headers);
    console.log("🔴 req.user:", req.user);

    const userId = req.user?.user_id;
    const { recipientId, conversationId, callType } = req.body;
    const io = req.app.get("io");

    console.log(`📞 initiateCall request from ${userId}:`, {
      recipientId,
      conversationId,
      callType,
    });

    // Validation with detailed error messages
    if (!recipientId) {
      return res.status(400).json({
        success: false,
        message: "recipientId is required",
        received: { recipientId },
      });
    }

    if (!conversationId) {
      return res.status(400).json({
        success: false,
        message: "conversationId is required",
        received: { conversationId },
      });
    }

    if (!callType) {
      return res.status(400).json({
        success: false,
        message: "callType is required (voice or video)",
        received: { callType },
      });
    }

    if (!["voice", "video"].includes(callType)) {
      return res.status(400).json({
        success: false,
        message: "callType must be 'voice' or 'video'",
        received: { callType },
      });
    }

    if (userId === recipientId) {
      return res.status(400).json({
        success: false,
        message: "Cannot call yourself",
      });
    }

    console.log(`✅ Validation passed, calling CallService.initiateCall...`);
    const call = await CallService.initiateCall(
      userId,
      recipientId,
      conversationId,
      callType,
    );
    console.log(`✅ Call created:`, {
      call_id: call.call_id,
      status: call.status,
    });

    // Fetch fresh user data to get full name and avatar (not always in JWT)
    const initiator = await getUserById(userId);
    const callerName =
      initiator?.fullname ||
      initiator?.username ||
      req.user?.username ||
      "Unknown";
    const callerAvatar =
      initiator?.avatarPath ||
      initiator?.avatar_path ||
      req.user?.avatar ||
      null;

    // Emit incoming call event to recipient
    if (io) {
      io.to(`user:${recipientId}`).emit("incoming_call", {
        callId: call.call_id,
        callerId: userId,
        callerName,
        callerAvatar,
        callType,
        conversationId,
        timestamp: new Date().toISOString(),
      });
      console.log(
        `📱 incoming_call emitted to user:${recipientId} with callId: ${call.call_id} by ${callerName}`,
      );
    }

    res.status(201).json({
      success: true,
      data: call,
    });
  } catch (error) {
    console.error(`❌ initiateCall error:`, {
      message: error.message,
      stack: error.stack,
      code: error.code,
    });
    res.status(400).json({
      success: false,
      message: error.message,
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Accept a call
 * POST /api/calls/:callId/accept
 */
const acceptCall = async (req, res) => {
  try {
    const { callId } = req.params;
    const userId = req.user.user_id;
    const io = req.app.get("io");

    if (!callId) {
      return res.status(400).json({
        success: false,
        message: "callId is required",
      });
    }

    // Get the call to find the initiator
    const call = await CallModel.findById(callId);

    if (!call) {
      return res.status(404).json({
        success: false,
        message: "Call not found",
      });
    }

    // Verify the current user is the recipient
    if (call.recipient_id !== userId) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized to accept this call",
      });
    }

    const result = await CallService.acceptCall(
      callId,
      req.user?.socket_id || "",
    );

    console.log(`✅ Call accepted: ${callId}`, {
      initiator_id: call.initiator_id,
      recipient_id: userId,
      io_exists: !!io,
    });

    // Emit event to initiator
    if (io && call.initiator_id) {
      io.to(`user:${call.initiator_id}`).emit("call_accepted", {
        callId,
        recipientId: userId,
        recipientSocketId: req.user?.socket_id || "",
        recipientName: req.user?.full_name || req.user?.username || "Unknown",
        recipientAvatar: req.user?.avatar || null,
        timestamp: new Date().toISOString(),
      });
      console.log(
        `📱 call_accepted emitted to user:${call.initiator_id} with callId: ${callId}`,
      );
    } else {
      console.warn(`⚠️  Cannot emit call_accepted:`, {
        has_io: !!io,
        initiator_id: call.initiator_id,
      });
    }

    res.status(200).json({
      success: true,
      data: result.call,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Reject a call
 * POST /api/calls/:callId/reject
 */
const rejectCall = async (req, res) => {
  try {
    const { callId } = req.params;
    const { reason = "user_declined" } = req.body;
    const userId = req.user.user_id;
    const io = req.app.get("io");

    if (!callId) {
      return res.status(400).json({
        success: false,
        message: "callId is required",
      });
    }

    // Get the call to find the initiator
    const call = await CallModel.findById(callId);

    if (!call) {
      return res.status(404).json({
        success: false,
        message: "Call not found",
      });
    }

    // Verify the current user can reject this call (recipient or initiator)
    if (call.initiator_id !== userId && call.recipient_id !== userId) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized to reject this call",
      });
    }

    const call_updated = await CallService.rejectCall(callId, reason);

    // Emit event to the other party
    const otherUserId =
      call.initiator_id === userId ? call.recipient_id : call.initiator_id;
    if (io && otherUserId) {
      io.to(`user:${otherUserId}`).emit("call_rejected", {
        callId,
        reason,
        timestamp: new Date().toISOString(),
      });
    }

    res.status(200).json({
      success: true,
      data: call_updated,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Cancel a call
 * POST /api/calls/:callId/cancel
 */
const cancelCall = async (req, res) => {
  try {
    const { callId } = req.params;
    const userId = req.user.user_id;
    const io = req.app.get("io");

    if (!callId) {
      return res.status(400).json({
        success: false,
        message: "callId is required",
      });
    }

    // Get the call
    const call = await CallModel.findById(callId);

    if (!call) {
      return res.status(404).json({
        success: false,
        message: "Call not found",
      });
    }

    // Verify the current user is the initiator (only initiator can cancel)
    if (call.initiator_id !== userId) {
      return res.status(403).json({
        success: false,
        message: "Only call initiator can cancel",
      });
    }

    const call_updated = await CallService.cancelCall(callId);

    // Emit event to recipient
    if (io && call.recipient_id) {
      io.to(`user:${call.recipient_id}`).emit("call_cancelled", {
        callId,
        reason: "Caller cancelled",
        timestamp: new Date().toISOString(),
      });
    }

    res.status(200).json({
      success: true,
      data: call_updated,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * End a call
 * POST /api/calls/:callId/end
 */
const endCall = async (req, res) => {
  try {
    const { callId } = req.params;
    const userId = req.user.user_id;
    const io = req.app.get("io");

    if (!callId) {
      return res.status(400).json({
        success: false,
        message: "callId is required",
      });
    }

    // Get the call to find the other party
    const call = await CallModel.findById(callId);

    if (!call) {
      return res.status(404).json({
        success: false,
        message: "Call not found",
      });
    }

    // Verify the current user is part of this call
    if (call.initiator_id !== userId && call.recipient_id !== userId) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized to end this call",
      });
    }

    const call_updated = await CallService.endCall(callId);

    // Emit event to the other party
    const otherUserId =
      call.initiator_id === userId ? call.recipient_id : call.initiator_id;
    if (io && otherUserId) {
      io.to(`user:${otherUserId}`).emit("call_ended", {
        callId,
        duration: call_updated?.duration_seconds || 0,
        timestamp: new Date().toISOString(),
      });
    }

    res.status(200).json({
      success: true,
      data: call_updated,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Get call history for conversation
 * GET /api/conversations/:conversationId/calls
 */
const getCallHistory = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { limit = 50, cursor } = req.query;

    if (!conversationId) {
      return res.status(400).json({
        success: false,
        message: "conversationId is required",
      });
    }

    const result = await CallService.getCallHistory(
      conversationId,
      parseInt(limit),
      cursor,
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Get active calls for user
 * GET /api/calls/active
 */
const getActiveCalls = async (req, res) => {
  try {
    const userId = req.user.user_id;

    const calls = await CallService.getActiveCallsForUser(userId);

    res.status(200).json({
      success: true,
      data: calls,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Get call by ID
 * GET /api/calls/:callId
 */
const getCallById = async (req, res) => {
  try {
    const { callId } = req.params;

    if (!callId) {
      return res.status(400).json({
        success: false,
        message: "callId is required",
      });
    }

    const call = await CallModel.findById(callId);

    if (!call) {
      return res.status(404).json({
        success: false,
        message: "Call not found",
      });
    }

    res.status(200).json({
      success: true,
      data: call,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Initiate a group call
 * POST /api/calls/group
 */
const initiateGroupCall = async (req, res) => {
  try {
    const userId = req.user?.user_id;
    const { conversationId, callType, participantIds } = req.body;
    const io = req.app.get("io");

    if (
      !conversationId ||
      !callType ||
      !participantIds ||
      !Array.isArray(participantIds)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "conversationId, callType, and an array of participantIds are required",
      });
    }

    const call = await CallService.initiateGroupCall(
      userId,
      conversationId,
      callType,
      participantIds,
    );

    const conversation = await ConversationModel.findById(conversationId);
    const groupName = conversation?.name || "Group";
    const groupAvatar = conversation?.avatar_path || null;

    // Fetch fresh user data to get full name and avatar
    const initiator = await getUserById(userId);
    const callerName =
      initiator?.fullname ||
      initiator?.username ||
      req.user?.username ||
      "Unknown";
    const callerAvatar =
      initiator?.avatarPath ||
      initiator?.avatar_path ||
      req.user?.avatar ||
      null;

    // Emit incoming call to all participants via websocket
    if (io) {
      participantIds.forEach((participantId) => {
        if (participantId !== userId) {
          io.to(`user:${participantId}`).emit("incoming_call", {
            callId: call.call_id,
            callerId: userId,
            callerName,
            callerAvatar,
            callType,
            conversationId,
            isGroupCall: true,
            groupName,
            groupAvatar,
            participantIds,
            timestamp: new Date().toISOString(),
          });
        }
      });
      console.log(`📱 Group incoming_call emitted by ${callerName}`);
    }

    res.status(201).json({
      success: true,
      data: call,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Add participant to group call
 * POST /api/calls/:callId/add-participant
 */
const addParticipant = async (req, res) => {
  try {
    const { callId } = req.params;
    const { participantId } = req.body;

    if (!callId || !participantId) {
      return res.status(400).json({
        success: false,
        message: "callId and participantId are required",
      });
    }

    const call = await CallService.addGroupCallParticipant(
      callId,
      participantId,
    );

    res.status(200).json({
      success: true,
      data: call,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Remove participant from group call
 * POST /api/calls/:callId/remove-participant
 */
const removeParticipant = async (req, res) => {
  try {
    const { callId } = req.params;
    const { participantId } = req.body;

    if (!callId || !participantId) {
      return res.status(400).json({
        success: false,
        message: "callId and participantId are required",
      });
    }

    const call = await CallService.removeGroupCallParticipant(
      callId,
      participantId,
    );

    res.status(200).json({
      success: true,
      data: call,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  initiateCall,
  acceptCall,
  rejectCall,
  cancelCall,
  endCall,
  getCallHistory,
  getActiveCalls,
  getCallById,
  initiateGroupCall,
  addParticipant,
  removeParticipant,
};
