const ChatService = require("./chat.service");
const CallModel = require("./models/callModel");
const ConversationParticipantModel = require("./models/conversationParticipantModel");
const {
  emitAnswer,
  emitCallAccepted,
  emitCallEnded,
  emitCallRejected,
  emitICECandidate,
  emitIncomingCall,
  emitOffer,
  emitConversationUpdated,
  emitMessageToConversation,
  socketEventBus,
} = require("@core/websocket");
const { getUserById } = require("@modules/User/user.service");

let registered = false;

const resolvePeerFromCall = async (callId, currentUserId) => {
  if (!callId || typeof callId !== "string" || !callId.trim()) {
    return null;
  }

  const call = await CallModel.findById(callId);
  if (!call) return null;

  return {
    call,
    peerUserId:
      currentUserId === call.initiator_id ? call.recipient_id : call.initiator_id,
  };
};

const registerChatSocketListeners = () => {
  if (registered) return;
  registered = true;

  socketEventBus.on("socket.call_user", async ({ io, userId, data, socket }) => {
    const initiator = await getUserById(userId);
    emitIncomingCall(io, data.recipientId, {
      callId: data.callId,
      callerId: userId,
      callerName:
        initiator?.fullname || initiator?.username || socket.user?.username || "Unknown",
      callerAvatar:
        initiator?.avatarPath || initiator?.avatar_path || socket.user?.avatar || null,
      callType: data.callType,
      conversationId: data.conversationId,
    });
  });

  socketEventBus.on(
    "socket.group_call_initiated",
    async ({ io, userId, data, socket }) => {
      const effectiveInitiatorId = data.initiatorId || userId;
      const initiator = await getUserById(effectiveInitiatorId);

      for (const participantId of data.participantIds || []) {
        if (participantId === effectiveInitiatorId) continue;
        emitIncomingCall(io, participantId, {
          callId: data.callId,
          callerId: effectiveInitiatorId,
          callerName:
            initiator?.fullname ||
            initiator?.username ||
            socket.user?.username ||
            "Unknown",
          callerAvatar:
            initiator?.avatarPath ||
            initiator?.avatar_path ||
            socket.user?.avatar ||
            null,
          callType: data.callType,
          conversationId: data.conversationId,
          isGroupCall: true,
          participantIds: data.participantIds,
        });
      }
    },
  );

  socketEventBus.on("socket.accept_call", async ({ io, userId, data, socket }) => {
    const recipient = await getUserById(userId);
    const payload = {
      callId: data.callId,
      recipientId: userId,
      recipientSocketId: socket.id,
      recipientName:
        recipient?.fullname || recipient?.username || socket.user?.username || "Unknown",
      recipientAvatar:
        recipient?.avatarPath || recipient?.avatar_path || socket.user?.avatar || null,
      conversationId: data.conversationId,
    };

    if (data.conversationId) {
      const members =
        await ConversationParticipantModel.findMembersOfConversation(
          data.conversationId,
        );
      for (const member of members) {
        emitCallAccepted(io, member.user_id, payload);
      }
      return;
    }

    emitCallAccepted(io, data.callerId, payload);
  });

  ["socket.reject_call", "socket.call_rejected"].forEach((eventName) => {
    socketEventBus.on(eventName, async ({ io, userId, data }) => {
      if (data.callId) {
        await CallModel.update(data.callId, { status: "rejected" });
      }

      const targetUserId = data.callerId || data.toUserId || data.recipientId;
      if (targetUserId) {
        emitCallRejected(io, targetUserId, {
          callId: data.callId,
          reason: data.reason || "user_declined",
        });
      }
    });
  });

  ["socket.cancel_call", "socket.call_cancelled"].forEach((eventName) => {
    socketEventBus.on(eventName, async ({ io, userId, data }) => {
      if (data.callId) {
        await CallModel.update(data.callId, { status: "cancelled" });
      }

      if (data.conversationId) {
        const members =
          await ConversationParticipantModel.findMembersOfConversation(
            data.conversationId,
          );
        for (const member of members) {
          if (member.user_id === userId) continue;
          emitCallRejected(io, member.user_id, {
            callId: data.callId,
            reason: "Call cancelled",
          });
        }
        return;
      }

      if (data.toUserId) {
        emitCallRejected(io, data.toUserId, {
          callId: data.callId,
          reason: "Caller cancelled",
        });
      }
    });
  });

  socketEventBus.on("socket.end_call", async ({ io, userId, data }) => {
    let targetUserId = data.recipientId || data.toUserId;
    if (!targetUserId) {
      const resolved = await resolvePeerFromCall(data.callId, userId);
      targetUserId = resolved?.peerUserId || null;
    }

    if (data.conversationId) {
      const members =
        await ConversationParticipantModel.findMembersOfConversation(
          data.conversationId,
        );
      for (const member of members) {
        if (member.user_id === userId) continue;
        emitCallEnded(io, member.user_id, {
          callId: data.callId,
          duration: data.duration,
        });
      }
      return;
    }

    if (targetUserId) {
      emitCallEnded(io, targetUserId, {
        callId: data.callId,
        duration: data.duration,
      });
    }
  });

  socketEventBus.on("socket.save_call_message", async ({ io, userId, data }) => {
    const message = await ChatService.sendMessage(userId, data.conversationId, {
      content: data.content,
      type: data.type || "system_call",
      callData: data.callData,
    });

    emitMessageToConversation(io, data.conversationId, message);
    const members =
      await ConversationParticipantModel.findMembersOfConversation(
        data.conversationId,
      );

    for (const member of members) {
      emitConversationUpdated(io, data.conversationId, [member.user_id], {
        lastMessage: {
          messageId: message.messageId,
          content: message.content,
          type: message.type,
          senderName: message.senderName,
          senderAvatar: message.senderAvatar,
          createdAt: message.createdAt,
        },
        lastMessageTimestamp: message.createdAt,
        lastMessageId: message.messageId,
        unreadCount: member.user_id !== userId ? member.unread_count || 0 : 0,
      });
    }
  });

  socketEventBus.on("socket.offer", async ({ io, userId, data }) => {
    let targetUserId = data.recipientId || data.toUserId;
    if (!targetUserId) {
      const resolved = await resolvePeerFromCall(data.callId, userId);
      targetUserId = resolved?.peerUserId || null;
    }

    if (targetUserId && data.offer) {
      emitOffer(io, targetUserId, {
        callId: data.callId,
        callerId: userId,
        offer: data.offer,
      });
    }
  });

  socketEventBus.on("socket.answer", async ({ io, userId, data }) => {
    let targetUserId = data.callerId || data.toUserId;
    if (!targetUserId) {
      const resolved = await resolvePeerFromCall(data.callId, userId);
      targetUserId = resolved?.peerUserId || null;
    }

    if (targetUserId && data.answer) {
      emitAnswer(io, targetUserId, {
        callId: data.callId,
        recipientId: userId,
        answer: data.answer,
      });
    }
  });

  socketEventBus.on("socket.ice_candidate", async ({ io, userId, data }) => {
    let targetUserId = data.recipientId || data.toUserId;
    if (!targetUserId) {
      const resolved = await resolvePeerFromCall(data.callId, userId);
      targetUserId = resolved?.peerUserId || null;
    }

    if (targetUserId && data.candidate) {
      emitICECandidate(io, targetUserId, {
        callId: data.callId,
        candidate: data.candidate,
      });
    }
  });
};

module.exports = { registerChatSocketListeners };
