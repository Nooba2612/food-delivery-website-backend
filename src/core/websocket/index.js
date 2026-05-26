const { EventEmitter } = require("events");
const socketIO = require("socket.io");
const jwt = require("jsonwebtoken");

const socketEventBus = new EventEmitter();
socketEventBus.setMaxListeners(50);

let ioInstance = null;

const emitWithTimestamp = (target, eventName, payload) => {
  if (!target) return;
  target.emit(eventName, {
    ...payload,
    timestamp: payload?.timestamp || new Date().toISOString(),
  });
};

const emitToUserRoom = (io, userId, eventName, payload) => {
  if (!io || !userId) return;
  emitWithTimestamp(io.to(`user:${userId}`), eventName, payload);
};

const emitToConversation = (io, conversationId, eventName, payload) => {
  if (!io || !conversationId) return;
  emitWithTimestamp(io.to(`conversation_${conversationId}`), eventName, payload);
};

const initializeWebSocket = (server) => {
  const io = socketIO(server, {
    cors: {
      origin: process.env.CLIENT_URL || "http://localhost:1234",
      credentials: true,
    },
    transports: ["websocket", "polling"],
  });

  ioInstance = io;

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error("Authentication token required"));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
      socket.userId = decoded.user_id;
      socket.user = decoded;
      return next();
    } catch (error) {
      return next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.userId;
    socket.join(`user:${userId}`);

    socketEventBus.emit("socket.connected", { io, socket, userId });

    socket.on("join_conversation", (conversationId) => {
      socket.join(`conversation_${conversationId}`);
      emitToConversation(io, conversationId, "user_online", {
        userId,
        conversationId,
      });
    });

    socket.on("leave_conversation", (conversationId) => {
      socket.leave(`conversation_${conversationId}`);
      emitToConversation(io, conversationId, "user_offline", {
        userId,
        conversationId,
      });
    });

    socket.on("typing", (data) => {
      const roomName = `conversation_${data.conversationId}`;
      socket.to(roomName).emit("user_typing", {
        userId,
        conversationId: data.conversationId,
        timestamp: new Date().toISOString(),
      });
    });

    socket.on("stop_typing", (data) => {
      const roomName = `conversation_${data.conversationId}`;
      socket.to(roomName).emit("user_stop_typing", {
        userId,
        conversationId: data.conversationId,
        timestamp: new Date().toISOString(),
      });
    });

    [
      "call_user",
      "group_call_initiated",
      "accept_call",
      "reject_call",
      "call_rejected",
      "cancel_call",
      "call_cancelled",
      "end_call",
      "save_call_message",
      "offer",
      "answer",
      "ice_candidate",
    ].forEach((eventName) => {
      socket.on(eventName, (data) => {
        socketEventBus.emit(`socket.${eventName}`, { io, socket, userId, data });
      });
    });

    socket.on("disconnect", () => {
      socketEventBus.emit("socket.disconnected", { io, socket, userId });
    });

    socket.on("error", (error) => {
      socketEventBus.emit("socket.error", { io, socket, userId, error });
    });
  });

  return io;
};

const emitMessageToConversation = (io, conversationId, message) => {
  emitToConversation(io, conversationId, "new_message", message);
};

const emitMessageRead = (io, conversationId, data) => {
  emitToConversation(io, conversationId, "message_read", data);
};

const emitMessageEdited = (io, conversationId, message) => {
  emitToConversation(io, conversationId, "message_edited", message);
};

const emitMessageDeleted = (
  io,
  conversationId,
  messageId,
  deleted_by_user_id = null,
) => {
  if (!deleted_by_user_id) return;
  emitToUserRoom(io, deleted_by_user_id, "message_deleted", {
    conversationId,
    messageId,
  });
};

const emitMessageRecalled = (io, conversationId, messageId) => {
  emitToConversation(io, conversationId, "message_recalled", {
    conversationId,
    messageId,
  });
};

const emitReactionAdded = (io, conversationId, data) => {
  emitToConversation(io, conversationId, "reaction_added", data);
};

const emitReactionRemoved = (io, conversationId, data) => {
  emitToConversation(io, conversationId, "reaction_removed", data);
};

const emitMemberAdded = (io, conversationId, member) => {
  emitToConversation(io, conversationId, "member_added", member);
};

const emitMemberRemoved = (io, conversationId, memberId) => {
  emitToConversation(io, conversationId, "member_removed", {
    conversationId,
    memberId,
  });
};

const emitConversationUpdated = (
  io,
  conversationId,
  memberIds,
  conversationData,
) => {
  for (const memberId of memberIds) {
    emitToUserRoom(io, memberId, "conversation_updated", {
      conversationId,
      lastMessage: conversationData.lastMessage || null,
      lastMessageTimestamp: conversationData.lastMessageTimestamp,
      lastMessageId: conversationData.lastMessageId,
      unreadCount: conversationData.unreadCount,
    });
  }
};

const emitNewConversation = (io, memberIds, conversationData) => {
  for (const memberId of memberIds) {
    emitToUserRoom(io, memberId, "new_conversation", conversationData);
  }
};

const getOnlineUsersInConversation = (io, conversationId) => {
  const roomName = `conversation_${conversationId}`;
  const sockets = io.sockets.adapter.rooms.get(roomName);
  if (!sockets) return [];

  const onlineUsers = new Set();
  for (const socketId of sockets) {
    const socket = io.sockets.sockets.get(socketId);
    if (socket && socket.userId) {
      onlineUsers.add(socket.userId);
    }
  }
  return Array.from(onlineUsers);
};

const emitIncomingCall = (io, recipientId, callData) => {
  emitToUserRoom(io, recipientId, "incoming_call", callData);
};

const emitCallAccepted = (io, callerId, callData) => {
  emitToUserRoom(io, callerId, "call_accepted", callData);
};

const emitCallRejected = (io, callerId, callData) => {
  emitToUserRoom(io, callerId, "call_rejected", callData);
};

const emitCallEnded = (io, recipientId, callData) => {
  emitToUserRoom(io, recipientId, "call_ended", callData);
};

const emitOffer = (io, recipientId, offerData) => {
  emitToUserRoom(io, recipientId, "offer", offerData);
};

const emitAnswer = (io, callerId, answerData) => {
  emitToUserRoom(io, callerId, "answer", answerData);
};

const emitICECandidate = (io, recipientId, candidateData) => {
  emitToUserRoom(io, recipientId, "ice_candidate", candidateData);
};

const emitGroupDisbanded = (io, conversationId) => {
  emitToConversation(io, conversationId, "group_disbanded", { conversationId });
};

const emitMemberRoleUpdated = (io, conversationId, data) => {
  emitToConversation(io, conversationId, "member_role_updated", {
    conversationId,
    ...data,
  });
};

const emitOrderUpdated = (io, userId, payload) => {
  emitToUserRoom(io, userId, "order_updated", payload);
};

const getIO = () => ioInstance;

module.exports = {
  emitAnswer,
  emitCallAccepted,
  emitCallEnded,
  emitCallRejected,
  emitConversationUpdated,
  emitICECandidate,
  emitGroupDisbanded,
  emitIncomingCall,
  emitMemberAdded,
  emitMemberRemoved,
  emitMemberRoleUpdated,
  emitMessageDeleted,
  emitMessageEdited,
  emitMessageRead,
  emitMessageRecalled,
  emitMessageToConversation,
  emitNewConversation,
  emitOffer,
  emitOrderUpdated,
  emitReactionAdded,
  emitReactionRemoved,
  getIO,
  getOnlineUsersInConversation,
  initializeWebSocket,
  socketEventBus,
};
