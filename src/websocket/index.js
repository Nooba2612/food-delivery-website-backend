const socketIO = require("socket.io");
const jwt = require("jsonwebtoken");
const CallModel = require("@models/callModel");
const ChatService = require("@services/chatService");
const ConversationParticipantModel = require("@models/ConversationParticipantModel");

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
        socket.on("reject_call", async (data) => {
            const { callId, callerId, reason } = data;
            const callerRoom = `user:${callerId}`;

            console.log(`❌ Call rejected: ${callId} by user ${userId} (Reason: ${reason})`);

            // Update call status to "rejected"
            try {
                if (callId) {
                    await CallModel.update(callId, {
                        status: "rejected",
                    });
                    console.log(`✅ Call status updated to rejected: ${callId}`);
                }
            } catch (error) {
                console.error(`❌ Failed to update call status: ${error.message}`);
            }

            io.to(callerRoom).emit("call_rejected", {
                callId,
                reason,
                timestamp: new Date().toISOString(),
            });
        });

        // Backup event name for reject call
        socket.on("call_rejected", async (data) => {
            const { callId, toUserId, recipientId, reason } = data;
            const targetUserId = toUserId || recipientId;
            const callerRoom = `user:${targetUserId}`;

            console.log(`❌ Call rejected (backup): ${callId} by user ${userId}, target: ${targetUserId}`);

            // Update call status to "rejected"
            try {
                if (callId) {
                    await CallModel.update(callId, {
                        status: "rejected",
                    });
                    console.log(`✅ Call status updated to rejected: ${callId}`);
                }
            } catch (error) {
                console.error(`❌ Failed to update call status: ${error.message}`);
            }

            if (targetUserId) {
                io.to(callerRoom).emit("call_rejected", {
                    callId,
                    reason: reason || "user_declined",
                    timestamp: new Date().toISOString(),
                });
            }
        });

        // Cancel call (caller cancels before recipient accepts)
        socket.on("cancel_call", async (data) => {
            const { callId, toUserId } = data;
            const recipientRoom = `user:${toUserId}`;

            console.log(`🚫 Call cancelled: ${callId} by caller ${userId}, recipient: ${toUserId}`);

            // Update call status to "cancelled"
            try {
                await CallModel.update(callId, {
                    status: "cancelled",
                });
                console.log(`✅ Call status updated to cancelled: ${callId}`);
            } catch (error) {
                console.error(`❌ Failed to update call status: ${error.message}`);
            }

            // Emit to recipient
            io.to(recipientRoom).emit("call_cancelled", {
                callId,
                reason: "Caller cancelled",
                timestamp: new Date().toISOString(),
            });
        });

        // Backup event name for cancel call
        socket.on("call_cancelled", async (data) => {
            const { callId, toUserId } = data;
            const recipientRoom = `user:${toUserId}`;

            console.log(`🚫 Call cancelled (backup): ${callId} by caller ${userId}, recipient: ${toUserId}`);

            // Update call status to "cancelled"
            try {
                await CallModel.update(callId, {
                    status: "cancelled",
                });
                console.log(`✅ Call status updated to cancelled: ${callId}`);
            } catch (error) {
                console.error(`❌ Failed to update call status: ${error.message}`);
            }

            // Emit to recipient
            io.to(recipientRoom).emit("call_cancelled", {
                callId,
                reason: "Caller cancelled",
                timestamp: new Date().toISOString(),
            });
        });

        // End call
        socket.on("end_call", async (data) => {
            console.log(`📥 end_call received:`, {
                callId: data.callId,
                callIdType: typeof data.callId,
                hasRecipientId: !!data.recipientId,
                hasToUserId: !!data.toUserId,
                duration: data.duration,
            });

            const { callId, recipientId, toUserId, duration } = data;
            let targetUserId = recipientId || toUserId;

            // If recipientId not provided, look up from call record
            if (!targetUserId && callId && typeof callId === "string" && callId.trim().length > 0) {
                try {
                    console.log(`🔍 Looking up call for end_call: ${callId}`);
                    const call = await CallModel.findById(callId);
                    if (call) {
                        targetUserId = userId === call.initiator_id ? call.recipient_id : call.initiator_id;
                        console.log(`📞 Resolved recipientId from callId for end_call: ${targetUserId}`);
                    }
                } catch (error) {
                    console.error(`❌ Failed to lookup call ${callId}:`, error.message);
                }
            }

            const recipientRoom = `user:${targetUserId}`;

            console.log(`⏹️  Call ended: ${callId || "unknown"} - Duration: ${duration}s, Recipient: ${targetUserId}`);

            if (targetUserId) {
                io.to(recipientRoom).emit("call_ended", {
                    callId,
                    duration,
                    timestamp: new Date().toISOString(),
                });
            } else {
                console.warn(`⚠️  end_call: Cannot emit - Missing target or invalid callId`, {
                    targetUserId,
                    callId,
                    callIdType: typeof callId,
                });
            }
        });

        // Save call message (sent by frontend when call ends or is rejected)
        socket.on("save_call_message", async (data) => {
            const { conversationId, content, type, callData } = data;
            console.log(`💬 [save_call_message] Saving call message for conversation ${conversationId}`);

            try {
                // 1. Save to database using ChatService
                const message = await ChatService.sendMessage(userId, conversationId, {
                    content,
                    type: type || "system_call",
                    callData
                });

                // 2. Broadcast new message to conversation room
                const roomName = `conversation_${conversationId}`;
                io.to(roomName).emit("new_message", {
                    ...message,
                    timestamp: new Date().toISOString()
                });

                // 3. Emit conversation update to all members for sidebar refresh
                const members = await ConversationParticipantModel.findMembersOfConversation(conversationId);
                
                for (const member of members) {
                    // Update unread count for everyone except the sender
                    // Note: ChatService already updated unread counts in DB
                    io.to(`user:${member.user_id}`).emit("conversation_updated", {
                        conversationId,
                        lastMessage: {
                            messageId: message.messageId,
                            content: message.content,
                            type: message.type,
                            senderName: message.senderName,
                            senderAvatar: message.senderAvatar,
                            createdAt: message.createdAt
                        },
                        lastMessageTimestamp: message.createdAt,
                        lastMessageId: message.messageId,
                        unreadCount: member.user_id !== userId ? (member.unread_count || 0) : 0,
                        timestamp: new Date().toISOString()
                    });
                }

                console.log(`✅ [save_call_message] Call message saved and broadcasted`);
            } catch (error) {
                console.error(`❌ [save_call_message] Error:`, error.message);
            }
        });

        // WebRTC Signaling - Send offer
        socket.on("offer", async (data) => {
            console.log(`�🔴🔴 [BACKEND-OFFER] OFFER RECEIVED 🔴🔴🔴`);
            console.log(`📥 offer received:`, {
                callId: data.callId,
                hasRecipientId: !!data.recipientId,
                hasToUserId: !!data.toUserId,
                hasOffer: !!data.offer,
                fromUserId: userId,
                dataKeys: Object.keys(data),
                fullData: data,
            });

            const { callId, recipientId, toUserId, offer } = data;
            console.log(
                `🔴 [BACKEND-OFFER] Extracted values: recipientId=${recipientId}, toUserId=${toUserId}, callId=${callId}`,
            );

            let targetUserId = recipientId || toUserId;
            console.log(`🔴 [BACKEND-OFFER] Initial targetUserId: ${targetUserId}`);

            // If recipientId not provided, look up from call record
            if (!targetUserId && callId && typeof callId === "string" && callId.trim().length > 0) {
                console.log(`🔴 [BACKEND-OFFER] targetUserId is null, looking up call ${callId}`);
                try {
                    const call = await CallModel.findById(callId);
                    if (call) {
                        targetUserId = userId === call.initiator_id ? call.recipient_id : call.initiator_id;
                        console.log(`📞 Resolved recipientId from callId: ${targetUserId}`);
                    } else {
                        console.warn(`⚠️  Call not found: ${callId}`);
                    }
                } catch (error) {
                    console.error(`❌ Failed to lookup call ${callId}:`, error.message);
                }
            }

            const recipientRoom = `user:${targetUserId}`;
            console.log(`🔴 [BACKEND-OFFER] Will send to room: ${recipientRoom}`);
            console.log(
                `🔴 [BACKEND-OFFER] FINAL CHECK - targetUserId: ${targetUserId}, offer type: ${typeof offer}, offer keys: ${offer ? Object.keys(offer) : "null"}`,
            );
            console.log(`🔴 [BACKEND-OFFER] Offer object content:`, offer);

            if (targetUserId && offer) {
                io.to(recipientRoom).emit("offer", {
                    callId,
                    callerId: userId,
                    offer,
                    timestamp: new Date().toISOString(),
                });
                console.log(`✅✅✅ [BACKEND-OFFER] Offer forwarded to ${recipientRoom} for call: ${callId} ✅✅✅`);
            } else {
                console.warn(
                    `⚠️⚠️⚠️ [BACKEND-OFFER] Cannot forward - Missing ${!targetUserId ? "targetUserId" : ""}${!offer ? " offer" : ""} ⚠️⚠️⚠️`,
                    {
                        targetUserId,
                        hasOffer: !!offer,
                        callId,
                    },
                );
            }
        });

        // WebRTC Signaling - Send answer
        socket.on("answer", async (data) => {
            console.log(`�🔴 [BACKEND-ANSWER] ANSWER RECEIVED 🔴🔴🔴`);
            console.log(`📥 answer received:`, {
                callId: data.callId,
                hasCallerId: !!data.callerId,
                hasToUserId: !!data.toUserId,
                hasAnswer: !!data.answer,
                answerType: data.answer?.type,
                hasAnswerSDP: !!data.answer?.sdp,
                fromUserId: userId,
                dataKeys: Object.keys(data),
                fullData: data,
            });

            const { callId, callerId, toUserId, answer } = data;
            let targetUserId = callerId || toUserId;

            console.log(
                `🔴 [BACKEND-ANSWER] Extracted values: callerId=${callerId}, toUserId=${toUserId}, callId=${callId}`,
            );
            console.log(`🔴 [BACKEND-ANSWER] Initial targetUserId: ${targetUserId}`);

            // If callerId not provided, look up from call record
            if (!targetUserId && callId && typeof callId === "string" && callId.trim().length > 0) {
                console.log(`🔴 [BACKEND-ANSWER] targetUserId is null, looking up call ${callId}`);
                try {
                    const call = await CallModel.findById(callId);
                    if (call) {
                        console.log(
                            `🔴 [BACKEND-ANSWER] Call found - initiator_id: ${call.initiator_id}, recipient_id: ${call.recipient_id}, current userId: ${userId}`,
                        );
                        targetUserId = userId === call.recipient_id ? call.initiator_id : call.recipient_id;
                        console.log(
                            `📞 Resolved callerId from callId: ${targetUserId} (receiver was ${userId === call.recipient_id ? "recipient" : "initiator"})`,
                        );
                    } else {
                        console.warn(`⚠️  Call not found: ${callId}`);
                    }
                } catch (error) {
                    console.error(`❌ Failed to lookup call ${callId}:`, error.message);
                }
            }

            const callerRoom = `user:${targetUserId}`;
            console.log(`🔴 [BACKEND-ANSWER] Will send to room: ${callerRoom}`);
            console.log(
                `🔴 [BACKEND-ANSWER] FINAL CHECK - targetUserId: ${targetUserId}, answer type: ${typeof answer}, answer keys: ${answer ? Object.keys(answer) : "null"}`,
            );
            console.log(`🔴 [BACKEND-ANSWER] Answer object content:`, answer);

            if (targetUserId && answer) {
                io.to(callerRoom).emit("answer", {
                    callId,
                    recipientId: userId,
                    answer,
                    timestamp: new Date().toISOString(),
                });
                console.log(`✅✅✅ [BACKEND-ANSWER] Answer forwarded to ${callerRoom} for call: ${callId} ✅✅✅`);
            } else {
                console.warn(
                    `⚠️⚠️⚠️ [BACKEND-ANSWER] Cannot forward - Missing ${!targetUserId ? "targetUserId" : ""}${!answer ? " answer" : ""} ⚠️⚠️⚠️`,
                    {
                        targetUserId,
                        hasAnswer: !!answer,
                        callId,
                    },
                );
            }
        });

        // WebRTC Signaling - Send ICE candidate
        socket.on("ice_candidate", async (data) => {
            console.log(`📥 ice_candidate received:`, {
                dataKeys: Object.keys(data),
                callId: data.callId, // Show actual value, not just truthy/falsy
                hasCallId: !!data.callId,
                callIdType: typeof data.callId,
                hasRecipientId: !!data.recipientId,
                hasToUserId: !!data.toUserId,
                hasCandidate: !!data.candidate,
                userId,
            });

            const { callId, recipientId, toUserId, candidate } = data;
            let targetUserId = recipientId || toUserId;

            // If recipientId not provided AND callId is valid, look up from call record
            if (!targetUserId && callId && typeof callId === "string" && callId.trim().length > 0) {
                try {
                    const call = await CallModel.findById(callId);

                    if (call) {
                        targetUserId = userId === call.initiator_id ? call.recipient_id : call.initiator_id;
                        console.log(`📞 Resolved recipientId from callId: ${targetUserId}`);
                    } else {
                        console.warn(`⚠️  Call not found in database: ${callId}`);
                    }
                } catch (error) {
                    console.error(`❌ Failed to lookup call ${callId}:`, error.message);
                }
            } else if (!targetUserId && !callId) {
                console.error(`❌ CRITICAL: Neither recipientId/toUserId nor valid callId provided!`);
                console.error(`   Frontend must send EITHER:`);
                console.error(`   1. recipientId: "user_id"  OR`);
                console.error(`   2. callId: "valid_uuid_string"`);
            } else if (!targetUserId && callId === null) {
                console.error(`❌ callId is null! Frontend should not send null values.`);
                console.error(`   Either omit the field or send valid UUID string`);
            }

            const recipientRoom = `user:${targetUserId}`;

            if (targetUserId && candidate) {
                io.to(recipientRoom).emit("ice_candidate", {
                    callId,
                    candidate,
                    timestamp: new Date().toISOString(),
                });
                console.log(`✅ ICE candidate forwarded to ${recipientRoom} for call: ${callId}`);
            } else {
                console.warn(
                    `⚠️  ice_candidate: Cannot forward - Missing ${!targetUserId ? "targetUserId" : ""}${!candidate ? " candidate" : ""}`,
                    {
                        targetUserId,
                        hasCandidate: !!candidate,
                        callId,
                    },
                );
            }
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
};
