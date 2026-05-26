const { v4: uuidv4 } = require("uuid");
const CallModel = require("./models/callModel");
const ActiveCallModel = require("./models/activeCallModel");
const ConversationParticipantModel = require("./models/conversationParticipantModel");
const userService = require("@modules/User/user.service");

class CallService {
  /**
   * Initiate a call
   */
  static async initiateCall(
    initiatorId,
    recipientId,
    conversationId,
    callType,
  ) {
    try {
      // Validate inputs
      if (!initiatorId || !recipientId || !conversationId || !callType) {
        throw new Error("Missing required fields");
      }

      if (!["voice", "video"].includes(callType)) {
        throw new Error("Invalid call type");
      }

      // Check if users are in same conversation
      let initiatorMember = false;
      let recipientMember = false;

      try {
        initiatorMember = await ConversationParticipantModel.isMember(
          conversationId,
          initiatorId,
        );
      } catch (error) {
        console.warn(
          `⚠️  Failed to check initiator membership:`,
          error.message,
        );
        initiatorMember = false;
      }

      try {
        recipientMember = await ConversationParticipantModel.isMember(
          conversationId,
          recipientId,
        );
      } catch (error) {
        console.warn(
          `⚠️  Failed to check recipient membership:`,
          error.message,
        );
        recipientMember = false;
      }

      if (!initiatorMember || !recipientMember) {
        throw new Error("Users are not in the same conversation");
      }

      // Create call record
      const call = await CallModel.create({
        conversation_id: conversationId,
        initiator_id: initiatorId,
        recipient_id: recipientId,
        call_type: callType,
        status: "ringing",
      });

      return call;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Initiate a group call
   */
  static async initiateGroupCall(
    initiatorId,
    conversationId,
    callType,
    participantIds,
  ) {
    try {
      if (
        !initiatorId ||
        !conversationId ||
        !callType ||
        !participantIds ||
        !Array.isArray(participantIds)
      ) {
        throw new Error("Missing required fields");
      }

      if (!["voice", "video"].includes(callType)) {
        throw new Error("Invalid call type");
      }

      const call = await CallModel.create({
        conversation_id: conversationId,
        initiator_id: initiatorId,
        call_type: callType,
        is_group_call: true,
        participant_ids: participantIds,
        active_participant_ids: [initiatorId],
        status: "ringing",
      });

      return call;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Add participant to group call
   */
  static async addGroupCallParticipant(callId, participantId) {
    try {
      const call = await CallModel.findById(callId);
      if (!call) throw new Error("Call not found");

      let activeParticipants = call.active_participant_ids || [];
      if (!activeParticipants.includes(participantId)) {
        activeParticipants.push(participantId);
      }

      return await CallModel.update(callId, {
        active_participant_ids: activeParticipants,
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Remove participant from group call
   */
  static async removeGroupCallParticipant(callId, participantId) {
    try {
      const call = await CallModel.findById(callId);
      if (!call) throw new Error("Call not found");

      let activeParticipants = call.active_participant_ids || [];
      activeParticipants = activeParticipants.filter(
        (id) => id !== participantId,
      );

      return await CallModel.update(callId, {
        active_participant_ids: activeParticipants,
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Accept a call
   */
  static async acceptCall(callId, recipientSocketId) {
    try {
      // Update call status
      const call = await CallModel.update(callId, {
        status: "accepted",
        started_at: new Date().toISOString(),
      });

      // Create active call record
      const activeCall = await ActiveCallModel.create({
        call_id: callId,
        recipient_socket_id: recipientSocketId,
      });

      return { call, activeCall };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Reject a call
   */
  static async rejectCall(callId, reason = "user_declined") {
    try {
      // Update call status
      const call = await CallModel.update(callId, {
        status: "rejected",
      });

      // Clean up active call
      const activeCall = await ActiveCallModel.findByCallId(callId);
      if (activeCall) {
        await ActiveCallModel.delete(activeCall.id);
      }

      return call;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Cancel a call (caller cancels before recipient accepts)
   */
  static async cancelCall(callId) {
    try {
      // Update call status
      const call = await CallModel.update(callId, {
        status: "cancelled",
      });

      // Clean up active call (if any)
      const activeCall = await ActiveCallModel.findByCallId(callId);
      if (activeCall) {
        await ActiveCallModel.delete(activeCall.id);
      }

      return call;
    } catch (error) {
      throw error;
    }
  }

  /**
   * End a call
   */
  static async endCall(callId) {
    try {
      // Update call status and calculate duration
      const call = await CallModel.endCall(callId);

      // Remove active call record
      const activeCall = await ActiveCallModel.findByCallId(callId);
      if (activeCall) {
        await ActiveCallModel.delete(activeCall.id);
      }

      return call;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get call history for conversation
   */
  static async getCallHistory(conversationId, limit = 50, cursor = null) {
    try {
      const result = await CallModel.getHistory(conversationId, limit, cursor);

      // Enrich with user info
      const enrichedCalls = [];
      for (const call of result.calls) {
        const initiator = await userService.getUserById(call.initiator_id);
        const recipient = await userService.getUserById(call.recipient_id);

        enrichedCalls.push({
          ...call,
          initiatorName: initiator?.fullname || initiator?.username,
          initiatorAvatar: initiator?.avatar_path,
          recipientName: recipient?.fullname || recipient?.username,
          recipientAvatar: recipient?.avatar_path,
        });
      }

      return {
        calls: enrichedCalls,
        hasMore: !!result.lastKey,
        nextCursor: result.lastKey,
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get active calls for user
   */
  static async getActiveCallsForUser(userId) {
    try {
      const calls = await CallModel.getActiveCallsForUser(userId);

      // Enrich with user info
      const enrichedCalls = [];
      for (const call of calls) {
        const otherUserId =
          call.initiator_id === userId ? call.recipient_id : call.initiator_id;
        const otherUser = await userService.getUserById(otherUserId);

        enrichedCalls.push({
          ...call,
          otherUserName: otherUser?.fullname || otherUser?.username,
          otherUserAvatar: otherUser?.avatar_path,
        });
      }

      return enrichedCalls;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get all active calls (for admin/monitoring)
   */
  static async getAllActiveCalls() {
    try {
      return await ActiveCallModel.getAllActiveCalls();
    } catch (error) {
      throw error;
    }
  }
}

module.exports = CallService;
