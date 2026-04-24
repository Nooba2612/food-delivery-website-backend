const socketIO = require("socket.io");
const jwt = require("jsonwebtoken");

// Store active user connections
// Format: { userId: { socketId: socket, conversationIds: [...] } }
const userConnections = {};

const initializeWebSocket = (server) => {
    const io = socketIO(server, {
        cors: {
            origin: process.env.CLIENT_URL || "http://localhost:1234",
            credentials: true,
        },
        transports: ["websocket", "polling"],
    });

    // Middleware to authenticate socket connection
    io.use((socket, next) => {
        try {
            const token = socket.handshake.auth.token;
            if (!token) {
                return next(new Error("Authentication token required"));
            }

            const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
            socket.userId = decoded.user_id;
            socket.user = decoded;
            next();
        } catch (error) {
            next(new Error("Invalid token"));
        }
    });

    // Connection handler
    io.on("connection", (socket) => {
        const userId = socket.userId;
        console.log(`✅ User ${userId} connected: ${socket.id}`);

        // Track user connection
        if (!userConnections[userId]) {
            userConnections[userId] = {};
        }
        userConnections[userId][socket.id] = socket;

        // Join personal user room for receiving updates (use colon format for FE)
        socket.join(`user:${userId}`);
        console.log(`👤 User ${userId} joined personal room: user:${userId}`);

        // Join conversation rooms
        socket.on("join_conversation", (conversationId) => {
            const roomName = `conversation_${conversationId}`;
            socket.join(roomName);
            console.log(`👥 User ${userId} joined conversation: ${conversationId}`);

            // Notify others that user is online
            io.to(roomName).emit("user_online", {
                userId,
                conversationId,
                timestamp: new Date().toISOString(),
            });
        });

        // Leave conversation
        socket.on("leave_conversation", (conversationId) => {
            const roomName = `conversation_${conversationId}`;
            socket.leave(roomName);
            console.log(`👥 User ${userId} left conversation: ${conversationId}`);

            // Notify others that user is offline
            io.to(roomName).emit("user_offline", {
                userId,
                conversationId,
                timestamp: new Date().toISOString(),
            });
        });

        // Handle typing indicator
        socket.on("typing", (data) => {
            const { conversationId } = data;
            const roomName = `conversation_${conversationId}`;
            socket.to(roomName).emit("user_typing", {
                userId,
                conversationId,
                timestamp: new Date().toISOString(),
            });
        });

        // Handle stop typing
        socket.on("stop_typing", (data) => {
            const { conversationId } = data;
            const roomName = `conversation_${conversationId}`;
            socket.to(roomName).emit("user_stop_typing", {
                userId,
                conversationId,
                timestamp: new Date().toISOString(),
            });
        });

        // ===== CALL HANDLERS =====

        // Initiate call
        socket.on("call_user", (data) => {
            const { callId, recipientId, callType, conversationId } = data;
            const recipientRoom = `user:${recipientId}`;

            console.log(`📞 Call initiated from ${userId} to ${recipientId} (${callType})`);

            io.to(recipientRoom).emit("incoming_call", {
                callId,
                callerId: userId,
                callerName: socket.user?.full_name || "Unknown",
                callerAvatar: socket.user?.avatar || null,
                callType,
                conversationId,
                timestamp: new Date().toISOString(),
            });
        });

        // Accept call
        socket.on("accept_call", (data) => {
            const { callId, callerId } = data;
            const callerRoom = `user:${callerId}`;

            console.log(`✅ Call accepted: ${callId} by user ${userId}`);

            io.to(callerRoom).emit("call_accepted", {
                callId,
                recipientId: userId,
                recipientSocketId: socket.id,
                recipientName: socket.user?.full_name || "Unknown",
                recipientAvatar: socket.user?.avatar || null,
                timestamp: new Date().toISOString(),
            });
        });

        // Reject call
        socket.on("reject_call", (data) => {
            const { callId, callerId, reason } = data;
            const callerRoom = `user:${callerId}`;

            console.log(`❌ Call rejected: ${callId} by user ${userId} (Reason: ${reason})`);

            io.to(callerRoom).emit("call_rejected", {
                callId,
                reason,
                timestamp: new Date().toISOString(),
            });
        });

        // End call
        socket.on("end_call", (data) => {
            const { callId, recipientId, duration } = data;
            const recipientRoom = `user:${recipientId}`;

            console.log(`⏹️  Call ended: ${callId} - Duration: ${duration}s`);

            io.to(recipientRoom).emit("call_ended", {
                callId,
                duration,
                timestamp: new Date().toISOString(),
            });
        });

        // WebRTC Signaling - Send offer
        socket.on("offer", (data) => {
            const { callId, recipientId, offer } = data;
            const recipientRoom = `user:${recipientId}`;

            console.log(`📡 Offer received for call: ${callId}`);

            io.to(recipientRoom).emit("offer", {
                callId,
                callerId: userId,
                offer,
                timestamp: new Date().toISOString(),
            });
        });

        // WebRTC Signaling - Send answer
        socket.on("answer", (data) => {
            const { callId, callerId, answer } = data;
            const callerRoom = `user:${callerId}`;

            console.log(`📡 Answer received for call: ${callId}`);

            io.to(callerRoom).emit("answer", {
                callId,
                recipientId: userId,
                answer,
                timestamp: new Date().toISOString(),
            });
        });

        // WebRTC Signaling - Send ICE candidate
        socket.on("ice_candidate", (data) => {
            const { callId, recipientId, candidate } = data;
            const recipientRoom = `user:${recipientId}`;

            console.log(`❄️  ICE candidate for call: ${callId}`);

            io.to(recipientRoom).emit("ice_candidate", {
                callId,
                candidate,
                timestamp: new Date().toISOString(),
            });
        });

        // ===== SUPPORT CHAT HANDLERS (Customer ↔ Admin) =====
        // Dùng prefix 'support:' để tách biệt khỏi hệ thống chat tổng quát

        // Customer / Admin tham gia room của cuộc hội thoại hỗ trợ
        socket.on("support:join", (conversationId) => {
            const roomName = `support_conv_${conversationId}`;
            socket.join(roomName);
            console.log(`💬 [Support] User ${userId} joined support room: ${roomName}`);
        });

        // Rời khỏi room hỗ trợ
        socket.on("support:leave", (conversationId) => {
            const roomName = `support_conv_${conversationId}`;
            socket.leave(roomName);
            console.log(`💬 [Support] User ${userId} left support room: ${roomName}`);
        });

        // Trạng thái đang gõ phín (Typing indicator)
        socket.on("support:typing", ({ conversationId }) => {
            const roomName = `support_conv_${conversationId}`;
            // emit tới tất cả thành viên trong room TỪ TRỪ socket hiện tại
            socket.to(roomName).emit("support:display_typing", {
                userId,
                conversationId,
            });
        });

        // Dừng gõ phín
        socket.on("support:stop_typing", ({ conversationId }) => {
            const roomName = `support_conv_${conversationId}`;
            socket.to(roomName).emit("support:hide_typing", {
                userId,
                conversationId,
            });
        });

        // Disconnect handler
        socket.on("disconnect", () => {
            console.log(`❌ User ${userId} disconnected: ${socket.id}`);

            // Clean up user connection
            if (userConnections[userId]) {
                delete userConnections[userId][socket.id];
                if (Object.keys(userConnections[userId]).length === 0) {
                    delete userConnections[userId];
                }
            }
        });

        // Error handler
        socket.on("error", (error) => {
            console.error(`Socket error for user ${userId}:`, error);
        });
    });

    return io;
};

/**
 * Emit message to conversation
 * @param {SocketIO.Server} io - Socket.io server instance
 * @param {string} conversationId - Conversation ID
 * @param {object} message - Message data
 */
const emitMessageToConversation = (io, conversationId, message) => {
    const roomName = `conversation_${conversationId}`;
    io.to(roomName).emit("new_message", {
        ...message,
        timestamp: new Date().toISOString(),
    });
};

/**
 * Emit message read status
 * @param {SocketIO.Server} io - Socket.io server instance
 * @param {string} conversationId - Conversation ID
 * @param {object} data - Read status data
 */
const emitMessageRead = (io, conversationId, data) => {
    const roomName = `conversation_${conversationId}`;
    io.to(roomName).emit("message_read", {
        ...data,
        timestamp: new Date().toISOString(),
    });
};

/**
 * Emit message edited
 * @param {SocketIO.Server} io - Socket.io server instance
 * @param {string} conversationId - Conversation ID
 * @param {object} message - Message data
 */
const emitMessageEdited = (io, conversationId, message) => {
    const roomName = `conversation_${conversationId}`;
    io.to(roomName).emit("message_edited", {
        ...message,
        timestamp: new Date().toISOString(),
    });
};

/**
 * Emit message deleted
 * @param {SocketIO.Server} io - Socket.io server instance
 * @param {string} conversationId - Conversation ID
 * @param {string} messageId - Message ID
 */
/**
 * Emit message deleted (Delete for Me - only to the user who deleted)
 * @param {SocketIO.Server} io - Socket.io server instance
 * @param {string} conversationId - Conversation ID
 * @param {string} messageId - Message ID
 * @param {string} deleted_by_user_id - User ID who deleted the message (only this user receives event)
 */
const emitMessageDeleted = (io, conversationId, messageId, deleted_by_user_id = null) => {
    // Emit ONLY to the user's personal room (Delete for Me)
    // Other users will NOT see the message as deleted
    if (deleted_by_user_id) {
        const userRoom = `user:${deleted_by_user_id}`;
        io.to(userRoom).emit("message_deleted", {
            conversationId,
            messageId,
            timestamp: new Date().toISOString(),
        });
    }
};

/**
 * Emit message recalled
 * @param {SocketIO.Server} io - Socket.io server instance
 * @param {string} conversationId - Conversation ID
 * @param {string} messageId - Message ID
 */
const emitMessageRecalled = (io, conversationId, messageId) => {
    const roomName = `conversation_${conversationId}`;
    io.to(roomName).emit("message_recalled", {
        conversationId,
        messageId,
        timestamp: new Date().toISOString(),
    });
};

/**
 * Emit reaction added
 * @param {SocketIO.Server} io - Socket.io server instance
 * @param {string} conversationId - Conversation ID
 * @param {object} data - Reaction data
 */
const emitReactionAdded = (io, conversationId, data) => {
    const roomName = `conversation_${conversationId}`;
    io.to(roomName).emit("reaction_added", {
        ...data,
        timestamp: new Date().toISOString(),
    });
};

/**
 * Emit reaction removed
 * @param {SocketIO.Server} io - Socket.io server instance
 * @param {string} conversationId - Conversation ID
 * @param {object} data - Reaction data
 */
const emitReactionRemoved = (io, conversationId, data) => {
    const roomName = `conversation_${conversationId}`;
    io.to(roomName).emit("reaction_removed", {
        ...data,
        timestamp: new Date().toISOString(),
    });
};

/**
 * Emit member added to group
 * @param {SocketIO.Server} io - Socket.io server instance
 * @param {string} conversationId - Conversation ID
 * @param {object} member - Member data
 */
const emitMemberAdded = (io, conversationId, member) => {
    const roomName = `conversation_${conversationId}`;
    io.to(roomName).emit("member_added", {
        ...member,
        timestamp: new Date().toISOString(),
    });
};

/**
 * Emit member removed from group
 * @param {SocketIO.Server} io - Socket.io server instance
 * @param {string} conversationId - Conversation ID
 * @param {string} memberId - Member ID
 */
const emitMemberRemoved = (io, conversationId, memberId) => {
    const roomName = `conversation_${conversationId}`;
    io.to(roomName).emit("member_removed", {
        conversationId,
        memberId,
        timestamp: new Date().toISOString(),
    });
};

/**
 * Emit conversation updated (for conversation list)
 * @param {SocketIO.Server} io - Socket.io server instance
 * @param {string} conversationId - Conversation ID
 * @param {Array} memberIds - Array of member user IDs
 * @param {object} conversationData - Updated conversation data with lastMessage object
 */
const emitConversationUpdated = (io, conversationId, memberIds, conversationData) => {
    // Emit to each member's personal room so they see updated conversation list
    for (const memberId of memberIds) {
        const userRoom = `user:${memberId}`;
        io.to(userRoom).emit("conversation_updated", {
            conversationId,
            lastMessage: conversationData.lastMessage || null,
            lastMessageTimestamp: conversationData.lastMessageTimestamp,
            lastMessageId: conversationData.lastMessageId,
            unreadCount: conversationData.unreadCount,
            timestamp: new Date().toISOString(),
        });
    }
};

/**
 * Get online users in conversation
 * @param {string} conversationId - Conversation ID
 * @returns {Array} Array of online user IDs
 */
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

/**
 * Emit incoming call
 * @param {SocketIO.Server} io - Socket.io server instance
 * @param {string} recipientId - Recipient user ID
 * @param {object} callData - Call data
 */
const emitIncomingCall = (io, recipientId, callData) => {
    const recipientRoom = `user:${recipientId}`;
    io.to(recipientRoom).emit("incoming_call", {
        ...callData,
        timestamp: new Date().toISOString(),
    });
};

/**
 * Emit call accepted
 * @param {SocketIO.Server} io - Socket.io server instance
 * @param {string} callerId - Caller user ID
 * @param {object} callData - Call data
 */
const emitCallAccepted = (io, callerId, callData) => {
    const callerRoom = `user:${callerId}`;
    io.to(callerRoom).emit("call_accepted", {
        ...callData,
        timestamp: new Date().toISOString(),
    });
};

/**
 * Emit call rejected
 * @param {SocketIO.Server} io - Socket.io server instance
 * @param {string} callerId - Caller user ID
 * @param {object} callData - Call data
 */
const emitCallRejected = (io, callerId, callData) => {
    const callerRoom = `user:${callerId}`;
    io.to(callerRoom).emit("call_rejected", {
        ...callData,
        timestamp: new Date().toISOString(),
    });
};

/**
 * Emit call ended
 * @param {SocketIO.Server} io - Socket.io server instance
 * @param {string} recipientId - Recipient user ID
 * @param {object} callData - Call data
 */
const emitCallEnded = (io, recipientId, callData) => {
    const recipientRoom = `user:${recipientId}`;
    io.to(recipientRoom).emit("call_ended", {
        ...callData,
        timestamp: new Date().toISOString(),
    });
};

/**
 * Emit WebRTC offer
 * @param {SocketIO.Server} io - Socket.io server instance
 * @param {string} recipientId - Recipient user ID
 * @param {object} offerData - Offer data
 */
const emitOffer = (io, recipientId, offerData) => {
    const recipientRoom = `user:${recipientId}`;
    io.to(recipientRoom).emit("offer", {
        ...offerData,
        timestamp: new Date().toISOString(),
    });
};

/**
 * Emit WebRTC answer
 * @param {SocketIO.Server} io - Socket.io server instance
 * @param {string} callerId - Caller user ID
 * @param {object} answerData - Answer data
 */
const emitAnswer = (io, callerId, answerData) => {
    const callerRoom = `user:${callerId}`;
    io.to(callerRoom).emit("answer", {
        ...answerData,
        timestamp: new Date().toISOString(),
    });
};

/**
 * Emit ICE candidate
 * @param {SocketIO.Server} io - Socket.io server instance
 * @param {string} recipientId - Recipient user ID
 * @param {object} candidateData - ICE candidate data
 */
const emitICECandidate = (io, recipientId, candidateData) => {
    const recipientRoom = `user:${recipientId}`;
    io.to(recipientRoom).emit("ice_candidate", {
        ...candidateData,
        timestamp: new Date().toISOString(),
    });
};

/**
 * Emit order updated status
 * @param {SocketIO.Server} io - Socket.io server instance
 * @param {string} userId - User ID who owns the order
 * @param {object} orderData - Updated order data (order_id, status, etc.)
 */
const emitOrderUpdated = (io, userId, orderData) => {
    const userRoom = `user:${userId}`;
    io.to(userRoom).emit("order_updated", {
        ...orderData,
        timestamp: new Date().toISOString(),
    });
};

module.exports = {
    initializeWebSocket,
    emitMessageToConversation,
    emitMessageRead,
    emitMessageEdited,
    emitMessageDeleted,
    emitMessageRecalled,
    emitReactionAdded,
    emitReactionRemoved,
    emitMemberAdded,
    emitMemberRemoved,
    emitConversationUpdated,
    getOnlineUsersInConversation,
    emitIncomingCall,
    emitCallAccepted,
    emitCallRejected,
    emitCallEnded,
    emitOffer,
    emitAnswer,
    emitICECandidate,
    emitOrderUpdated,
};
