const { v4: uuidv4 } = require("uuid");
const ConversationModel = require("@models/ConversationModel");
const ConversationParticipantModel = require("@models/ConversationParticipantModel");
const MessageModel = require("@models/MessageModel");
const userService = require("./userService");
const { toCamelCase } = require("@utils/responseFormatter");

class ChatService {
    // Get or create direct conversation between 2 users
    static async getOrCreateDirectConversation(userId, participantId) {
        try {
            // Check if conversation already exists
            const userConversations = await ConversationParticipantModel.findConversationsForUser(userId);

            for (const conv of userConversations.items) {
                const convData = await ConversationModel.findById(conv.conversation_id);
                // Skip inactive conversations
                if (!convData || convData.is_active === false) continue;

                if (convData.type === "1to1") {
                    const members = await ConversationParticipantModel.findMembersOfConversation(conv.conversation_id);
                    if (members.length === 2 && members.some((m) => m.user_id === participantId)) {
                        return toCamelCase(convData);
                    }
                }
            }

            // Create new conversation
            const participantData = await userService.getUserById(participantId);
            if (!participantData) {
                throw new Error("Participant not found");
            }

            const newConversation = await ConversationModel.create({
                type: "1to1",
                name: participantData.fullname || participantData.username,
                avatar_path: participantData.avatar_path,
                created_by: userId,
            });

            // Add both participants
            await ConversationParticipantModel.create({
                conversation_id: newConversation.conversation_id,
                user_id: userId,
                role: "member",
            });

            await ConversationParticipantModel.create({
                conversation_id: newConversation.conversation_id,
                user_id: participantId,
                role: "member",
            });

            return toCamelCase(newConversation);
        } catch (error) {
            throw error;
        }
    }

    // Create group conversation
    static async createGroupConversation(userId, name, participantIds, avatarPath = null) {
        try {
            if (!participantIds.includes(userId)) {
                participantIds.push(userId);
            }

            const newConversation = await ConversationModel.create({
                type: "group",
                name,
                avatar_path: avatarPath,
                created_by: userId,
                description: null,
            });

            // Add all participants
            for (const participantId of participantIds) {
                const role = participantId === userId ? "admin" : "member";
                await ConversationParticipantModel.create({
                    conversation_id: newConversation.conversation_id,
                    user_id: participantId,
                    role,
                });
            }

            // Send system message
            await MessageModel.create({
                conversation_id: newConversation.conversation_id,
                sender_id: userId,
                content: `Created group "${name}"`,
                type: "system",
            });

            return toCamelCase(newConversation);
        } catch (error) {
            throw error;
        }
    }

    // Get conversations for user
    static async getUserConversations(userId, limit = 20, cursor = null) {
        try {
            const result = await ConversationParticipantModel.findConversationsForUser(userId, limit, cursor);

            const conversations = [];
            for (const participant of result.items) {
                const conversation = await ConversationModel.findById(participant.conversation_id);
                // Skip inactive conversations and conversations deleted by user
                if (conversation && conversation.is_active !== false && !participant.deleted_at) {
                    let convData = {
                        ...conversation,
                        unreadCount: participant.unread_count,
                        isMuted: participant.is_muted,
                        isPinned: participant.is_pinned,
                        lastReadAt: participant.last_read_at,
                    };

                    // Get last message details if exists
                    if (conversation.last_message_id) {
                        const lastMessage = await MessageModel.findById(participant.conversation_id, conversation.last_message_id);
                        if (lastMessage) {
                            const sender = await userService.getUserById(lastMessage.sender_id);
                            convData.lastMessage = {
                                messageId: lastMessage.message_id,
                                content: lastMessage.content,
                                type: lastMessage.type,
                                senderName: sender?.fullname || sender?.username || "Unknown User",
                                senderAvatar: sender?.avatar_path || null,
                                createdAt: lastMessage.created_at,
                            };
                        }
                    }

                    // For 1-to-1 conversations, show the OTHER person's avatar/name
                    if (conversation.type === "1to1") {
                        const members = await ConversationParticipantModel.findMembersOfConversation(participant.conversation_id);
                        const otherMember = members.find((m) => m.user_id !== userId);
                        if (otherMember) {
                            const otherUser = await userService.getUserById(otherMember.user_id);
                            convData.name = otherUser?.fullname || otherUser?.username || "Unknown";
                            convData.avatar_path = otherUser?.avatar_path || null;
                        }
                    }

                    conversations.push(toCamelCase(convData));
                }
            }

            // Sort conversations by last message timestamp (newest first)
            conversations.sort((a, b) => {
                const aTime = new Date(a.lastMessageTimestamp || a.createdAt || 0).getTime();
                const bTime = new Date(b.lastMessageTimestamp || b.createdAt || 0).getTime();
                return bTime - aTime;
            });

            return {
                conversations,
                hasMore: !!result.lastEvaluatedKey,
                nextCursor: result.lastEvaluatedKey,
            };
        } catch (error) {
            throw error;
        }
    }

    // Get conversation details with members
    static async getConversationDetails(conversationId, userId) {
        try {
            const conversation = await ConversationModel.findById(conversationId);
            if (!conversation) {
                throw new Error("Conversation not found");
            }

            // Check if conversation is active
            if (conversation.is_active === false) {
                throw new Error("Conversation not found");
            }

            // Check if user is member
            const isMember = await ConversationParticipantModel.isMember(conversationId, userId);
            if (!isMember) {
                throw new Error("Not a member of this conversation");
            }

            const members = await ConversationParticipantModel.findMembersOfConversation(conversationId);

            const participantDetails = [];
            for (const member of members) {
                const user = await userService.getUserById(member.user_id);
                participantDetails.push({
                    userId: member.user_id,
                    username: user?.username || "Unknown",
                    email: user?.email || null,
                    fullname: user?.fullname || "Unknown User",
                    avatarPath: user?.avatar_path || null,
                    role: member.role,
                    joinedAt: member.joined_at,
                });
            }

            return toCamelCase({
                ...conversation,
                participants: participantDetails,
            });
        } catch (error) {
            throw error;
        }
    }

    // Send message
    static async sendMessage(userId, conversationId, messageData) {
        try {
            // Check conversation exists and is active
            const conversation = await ConversationModel.findById(conversationId);
            if (!conversation || conversation.is_active === false) {
                throw new Error("Conversation not found");
            }

            // Check user is member
            const isMember = await ConversationParticipantModel.isMember(conversationId, userId);
            if (!isMember) {
                throw new Error("Not a member of this conversation");
            }

            // Clear deleted_at if user sends a message (restore conversation)
            const deletedAt = await ConversationParticipantModel.getDeletedAt(conversationId, userId);
            if (deletedAt) {
                await ConversationParticipantModel.restoreConversation(conversationId, userId);
            }

            const message = await MessageModel.create({
                conversation_id: conversationId,
                sender_id: userId,
                content: messageData.content,
                type: messageData.type || "text",
                mentions: messageData.mentions || [],
                attachments: messageData.attachments || [],
                reply_to_id: messageData.replyToId || null,
                call_data: messageData.callData || null,
            });

            // Update conversation last message
            await ConversationModel.updateLastMessage(conversationId, message.message_id, new Date().toISOString());

            // Increment unread count for other members
            const members = await ConversationParticipantModel.findMembersOfConversation(conversationId);
            for (const member of members) {
                if (member.user_id !== userId) {
                    await ConversationParticipantModel.updateUnreadCount(conversationId, member.user_id, 1);
                }
            }

            const sender = await userService.getUserById(userId);
            return toCamelCase({
                ...message,
                senderName: sender?.fullname || sender?.username || "Unknown User",
                senderAvatar: sender?.avatar_path || null,
            });
        } catch (error) {
            throw error;
        }
    }

    // Get conversation history
    static async getConversationHistory(conversationId, userId, limit = 50, cursor = null) {
        try {
            // Check conversation exists and is active
            const conversation = await ConversationModel.findById(conversationId);
            if (!conversation || conversation.is_active === false) {
                throw new Error("Conversation not found");
            }

            // Check user is member
            const isMember = await ConversationParticipantModel.isMember(conversationId, userId);
            if (!isMember) {
                throw new Error("Not a member of this conversation");
            }

            // Get deleted_at timestamp for this user
            const deletedAt = await ConversationParticipantModel.getDeletedAt(conversationId, userId);

            const result = await MessageModel.getHistory(conversationId, limit, cursor, userId, deletedAt);

            const messages = [];
            for (const msg of result.messages) {
                const sender = await userService.getUserById(msg.sender_id);
                messages.push(
                    toCamelCase({
                        ...msg,
                        senderName: sender?.fullname || sender?.username || "Unknown User",
                        senderAvatar: sender?.avatar_path || null,
                    }),
                );
            }

            return {
                messages,
                hasMore: !!result.lastKey,
                nextCursor: result.lastKey,
            };
        } catch (error) {
            throw error;
        }
    }

    // Mark messages as read
    static async markMessagesAsRead(userId, conversationId, messageIds) {
        try {
            const conversation = await ConversationModel.findById(conversationId);
            if (!conversation || conversation.is_active === false) {
                throw new Error("Conversation not found");
            }

            for (const messageId of messageIds) {
                await MessageModel.updateStatus(conversationId, messageId, true);
            }

            await ConversationParticipantModel.markAsRead(conversationId, userId);

            return { success: true, readCount: messageIds.length };
        } catch (error) {
            throw error;
        }
    }

    // Mark entire conversation as read
    static async markConversationAsRead(userId, conversationId) {
        try {
            const conversation = await ConversationModel.findById(conversationId);
            if (!conversation || conversation.is_active === false) {
                throw new Error("Conversation not found");
            }

            await ConversationParticipantModel.markAsRead(conversationId, userId);
            return { success: true };
        } catch (error) {
            throw error;
        }
    }

    // Edit message
    static async editMessage(userId, conversationId, messageId, newContent) {
        try {
            const conversation = await ConversationModel.findById(conversationId);
            if (!conversation || conversation.is_active === false) {
                throw new Error("Conversation not found");
            }

            const message = await MessageModel.findById(conversationId, messageId);
            if (!message) {
                throw new Error("Message not found");
            }

            if (message.sender_id !== userId) {
                throw new Error("Can only edit your own messages");
            }

            const updated = await MessageModel.update(conversationId, messageId, {
                content: newContent,
                is_edited: true,
                edited_at: new Date().toISOString(),
            });

            return toCamelCase(updated);
        } catch (error) {
            throw error;
        }
    }

    // Delete message (Delete for Me - only for current user)
    static async deleteMessage(userId, conversationId, messageId) {
        try {
            const conversation = await ConversationModel.findById(conversationId);
            if (!conversation || conversation.is_active === false) {
                throw new Error("Conversation not found");
            }

            const message = await MessageModel.findById(conversationId, messageId);
            if (!message) {
                throw new Error("Message not found");
            }

            // Allow user to delete message for themselves
            const deleted = await MessageModel.deleteMessageForUser(conversationId, messageId, userId);
            return toCamelCase(deleted);
        } catch (error) {
            throw error;
        }
    }

    // Delete conversation (Delete for Me - only for current user, hides old messages)
    static async deleteConversation(userId, conversationId) {
        try {
            const conversation = await ConversationModel.findById(conversationId);
            if (!conversation) {
                throw new Error("Conversation not found");
            }

            // Check if user is member
            const isMember = await ConversationParticipantModel.isMember(conversationId, userId);
            if (!isMember) {
                throw new Error("Not a member of this conversation");
            }

            // Mark conversation as deleted for this user (set deleted_at)
            await ConversationParticipantModel.markAsDeleted(conversationId, userId);
            return { success: true, message: "Conversation deleted successfully" };
        } catch (error) {
            throw error;
        }
    }

    // Add reaction to message
    static async addReaction(userId, conversationId, messageId, emoji) {
        try {
            const conversation = await ConversationModel.findById(conversationId);
            if (!conversation || conversation.is_active === false) {
                throw new Error("Conversation not found");
            }

            const message = await MessageModel.findById(conversationId, messageId);
            if (!message) {
                throw new Error("Message not found");
            }

            const updated = await MessageModel.addReaction(conversationId, messageId, emoji, userId);
            return toCamelCase(updated);
        } catch (error) {
            throw error;
        }
    }

    // Remove reaction from message
    static async removeReaction(userId, conversationId, messageId, emoji) {
        try {
            const conversation = await ConversationModel.findById(conversationId);
            if (!conversation || conversation.is_active === false) {
                throw new Error("Conversation not found");
            }

            const message = await MessageModel.findById(conversationId, messageId);
            if (!message) {
                throw new Error("Message not found");
            }

            const updated = await MessageModel.removeReaction(conversationId, messageId, emoji, userId);
            return toCamelCase(updated);
        } catch (error) {
            throw error;
        }
    }

    // Add member to group
    static async addMemberToGroup(userId, conversationId, memberId) {
        try {
            const conversation = await ConversationModel.findById(conversationId);
            if (!conversation) {
                throw new Error("Conversation not found");
            }

            if (conversation.is_active === false) {
                throw new Error("Conversation not found");
            }

            if (conversation.type !== "group") {
                throw new Error("Not a group conversation");
            }

            // Check if user is admin
            const members = await ConversationParticipantModel.findMembersOfConversation(conversationId);
            const userMember = members.find((m) => m.user_id === userId);
            if (!userMember || userMember.role !== "admin") {
                throw new Error("Only admin can add members");
            }

            // Add member
            await ConversationParticipantModel.create({
                conversation_id: conversationId,
                user_id: memberId,
                role: "member",
            });

            // Send system message
            const newMember = await userService.getUserById(memberId);
            await MessageModel.create({
                conversation_id: conversationId,
                sender_id: userId,
                content: `Added ${newMember.fullname || newMember.username}`,
                type: "system",
            });

            return { success: true };
        } catch (error) {
            throw error;
        }
    }

    // Remove member from group
    static async removeMemberFromGroup(userId, conversationId, memberId) {
        try {
            const conversation = await ConversationModel.findById(conversationId);
            if (!conversation) {
                throw new Error("Conversation not found");
            }

            if (conversation.is_active === false) {
                throw new Error("Conversation not found");
            }

            if (conversation.type !== "group") {
                throw new Error("Not a group conversation");
            }

            // Check permissions
            if (userId !== memberId) {
                const members = await ConversationParticipantModel.findMembersOfConversation(conversationId);
                const userMember = members.find((m) => m.user_id === userId);
                if (!userMember || userMember.role !== "admin") {
                    throw new Error("Only admin can remove members");
                }
            }

            await ConversationParticipantModel.remove(conversationId, memberId);

            // Send system message
            if (userId !== memberId) {
                const removedMember = await userService.getUserById(memberId);
                await MessageModel.create({
                    conversation_id: conversationId,
                    sender_id: userId,
                    content: `Removed ${removedMember.fullname || removedMember.username}`,
                    type: "system",
                });
            }

            return { success: true };
        } catch (error) {
            throw error;
        }
    }

    // Update conversation settings
    static async updateConversationSettings(userId, conversationId, settings) {
        try {
            const conversation = await ConversationModel.findById(conversationId);
            if (!conversation) {
                throw new Error("Conversation not found");
            }

            if (conversation.is_active === false) {
                throw new Error("Conversation not found");
            }

            const isMember = await ConversationParticipantModel.isMember(conversationId, userId);
            if (!isMember) {
                throw new Error("Not a member of this conversation");
            }

            const updated = await ConversationParticipantModel.updateSettings(conversationId, userId, settings);

            return { success: true, settings: toCamelCase(updated) };
        } catch (error) {
            throw error;
        }
    }

    // Update conversation (name/avatar)
    static async updateConversation(userId, conversationId, updateData) {
        try {
            const conversation = await ConversationModel.findById(conversationId);
            if (!conversation) {
                throw new Error("Conversation not found");
            }

            if (conversation.is_active === false) {
                throw new Error("Conversation not found");
            }

            if (conversation.type === "group") {
                const members = await ConversationParticipantModel.findMembersOfConversation(conversationId);
                const userMember = members.find((m) => m.user_id === userId);
                if (!userMember || userMember.role !== "admin") {
                    throw new Error("Only admin can update group");
                }
            } else {
                throw new Error("Can only update group conversations");
            }

            const updated = await ConversationModel.update(conversationId, updateData);
            return toCamelCase(updated);
        } catch (error) {
            throw error;
        }
    }

    // Recall message (only sender can recall within 5 minutes)
    static async recallMessage(userId, conversationId, messageId) {
        try {
            const conversation = await ConversationModel.findById(conversationId);
            if (!conversation || conversation.is_active === false) {
                throw new Error("Conversation not found");
            }

            const message = await MessageModel.findById(conversationId, messageId);
            if (!message) {
                throw new Error("Message not found");
            }

            // Only sender can recall their own message
            if (message.sender_id !== userId) {
                throw new Error("Only message sender can recall this message");
            }

            // Check if message was already recalled
            if (message.is_recalled) {
                throw new Error("Message already recalled");
            }

            // Validate message age (< 5 minutes)
            const createdTime = new Date(message.created_at).getTime();
            const currentTime = new Date().getTime();
            const ageInMinutes = (currentTime - createdTime) / (1000 * 60);

            if (ageInMinutes > 5) {
                throw new Error("Messages can only be recalled within 5 minutes of sending");
            }

            // Recall the message
            const recalled = await MessageModel.recall(conversationId, messageId);

            return toCamelCase({
                ...recalled,
                senderName: await userService.getUserById(message.sender_id).then((u) => u?.fullname || "Unknown User"),
            });
        } catch (error) {
            throw error;
        }
    }
}

module.exports = ChatService;
