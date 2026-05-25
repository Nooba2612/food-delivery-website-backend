const { v4: uuidv4 } = require("uuid");
const ConversationModel = require("./models/conversationModel");
const ConversationParticipantModel = require("./models/conversationParticipantModel");
const MessageModel = require("./models/messageModel");
const userService = require("@modules/User/user.service");
const { toCamelCase } = require("@core/utils/responseFormatter");

class ChatService {
  // Get or create direct conversation between 2 users
  static async getOrCreateDirectConversation(userId, participantId) {
    try {
      // Check if conversation already exists
      const userConversations =
        await ConversationParticipantModel.findConversationsForUser(userId);

      for (const conv of userConversations.items) {
        const convData = await ConversationModel.findById(conv.conversation_id);
        // Skip inactive conversations
        if (!convData || convData.is_active === false) continue;

        if (convData.type === "1to1") {
          const members =
            await ConversationParticipantModel.findMembersOfConversation(
              conv.conversation_id,
            );
          if (
            members.length === 2 &&
            members.some((m) => m.user_id === participantId)
          ) {
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

      // Return full conversation details including members
      return await this.getConversationDetails(
        newConversation.conversation_id,
        userId,
      );
    } catch (error) {
      throw error;
    }
  }

  // Create group conversation
  static async createGroupConversation(
    userId,
    name,
    participantIds,
    avatarPath = null,
  ) {
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
      const creator = await userService.getUserById(userId);
      const creatorName = creator?.fullname || creator?.username || "Someone";

      await MessageModel.create({
        conversation_id: newConversation.conversation_id,
        sender_id: userId,
        content: `${creatorName} created group "${name}"`,
        type: "system",
      });

      // Return full conversation details including members for immediate UI update
      return await this.getConversationDetails(
        newConversation.conversation_id,
        userId,
      );
    } catch (error) {
      throw error;
    }
  }

  // Get conversations for user
  static async getUserConversations(userId, limit = 20, cursor = null) {
    try {
      const result =
        await ConversationParticipantModel.findConversationsForUser(
          userId,
          limit,
          cursor,
        );

      const conversations = [];
      for (const participant of result.items) {
        const conversation = await ConversationModel.findById(
          participant.conversation_id,
        );
        // Skip inactive conversations and conversations deleted by user
        if (conversation && !participant.deleted_at) {
          // Filter out inactive 1-to-1 conversations, but keep group conversations (even if disbanded)
          if (conversation.type === "1to1" && conversation.is_active === false)
            continue;
          const members =
            await ConversationParticipantModel.findMembersOfConversation(
              participant.conversation_id,
            );

          let convData = {
            ...conversation,
            unreadCount: participant.unread_count,
            isMuted: participant.is_muted,
            isPinned: participant.is_pinned,
            lastReadAt: participant.last_read_at,
            memberCount: members.length,
          };

          // Fetch all participants for the sidebar and management
          const participantDetails = [];
          for (const member of members) {
            const memberUser = await userService.getUserById(member.user_id);
            participantDetails.push({
              userId: member.user_id,
              role: member.role,
              fullname:
                memberUser?.fullname || memberUser?.username || "Unknown",
              avatarPath: memberUser?.avatar_path || null,
            });
          }
          convData.participants = participantDetails;

          // For group conversations, fetch first few member avatars for composite avatar
          if (conversation.type === "group") {
            convData.memberAvatars = participantDetails.slice(0, 3);
          }

          // Get last message details if exists
          if (conversation.last_message_id) {
            const lastMessage = await MessageModel.findById(
              participant.conversation_id,
              conversation.last_message_id,
            );
            if (lastMessage) {
              const sender = await userService.getUserById(
                lastMessage.sender_id,
              );
              convData.lastMessage = {
                messageId: lastMessage.message_id,
                content: lastMessage.content,
                type: lastMessage.type,
                senderName:
                  sender?.fullname ||
                  sender?.username ||
                  `User ${lastMessage.sender_id.slice(0, 8)}`,
                senderAvatar: sender?.avatar_path || null,
                createdAt: lastMessage.created_at,
              };
            }
          }

          // For 1-to-1 conversations, show the OTHER person's avatar/name
          if (conversation.type === "1to1") {
            const members =
              await ConversationParticipantModel.findMembersOfConversation(
                participant.conversation_id,
              );
            const otherMember = members.find((m) => m.user_id !== userId);
            if (otherMember) {
              const otherUser = await userService.getUserById(
                otherMember.user_id,
              );
              convData.name =
                otherUser?.fullname || otherUser?.username || "Unknown";
              convData.avatar_path = otherUser?.avatar_path || null;
            }
          }

          const formattedConv = toCamelCase(convData);
          conversations.push({
            ...formattedConv,
            conversation_id: convData.conversation_id,
            id: convData.conversation_id,
          });
        }
      }

      // Sort conversations by last message timestamp (newest first)
      conversations.sort((a, b) => {
        const aTime = new Date(
          a.lastMessageTimestamp || a.createdAt || 0,
        ).getTime();
        const bTime = new Date(
          b.lastMessageTimestamp || b.createdAt || 0,
        ).getTime();
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
      if (conversation.is_active === false && conversation.type === "1to1") {
        console.warn(
          "⚠️ [ChatService.getConversationDetails] Accessing inactive 1to1 conversation:",
          conversationId,
        );
        // Still allow access for now to fix the bug
      }

      // Check if user is member
      const memberExists = await ConversationParticipantModel.isMember(
        conversationId,
        userId,
      );
      console.log(
        "🔍 [ChatService.getConversationDetails] Checking membership:",
        { conversationId, userId },
      );
      console.log(
        "📊 [ChatService.getConversationDetails] Membership result:",
        memberExists,
      );

      if (!memberExists) {
        throw new Error("Not a member of this conversation");
      }

      const members =
        await ConversationParticipantModel.findMembersOfConversation(
          conversationId,
        );

      const participantDetails = [];
      for (const member of members) {
        const user = await userService.getUserById(member.user_id);
        participantDetails.push({
          userId: member.user_id,
          username: user?.username || `user_${member.user_id}`,
          email: user?.email || null,
          fullname:
            user?.fullname ||
            user?.username ||
            `User ${member.user_id.slice(0, 8)}`,
          avatarPath: user?.avatar_path || null,
          role: member.role,
          joinedAt: member.joined_at,
        });
      }

      const result = toCamelCase({
        ...conversation,
        participants: participantDetails,
      });

      // Ensure both conversation_id and id are available for frontend compatibility
      return {
        ...result,
        conversation_id: conversation.conversation_id,
        id: conversation.conversation_id,
      };
    } catch (error) {
      throw error;
    }
  }

  // Send message
  static async sendMessage(userId, conversationId, messageData) {
    try {
      console.log("📨 [ChatService.sendMessage] Request:", {
        userId,
        conversationId,
      });
      // Check conversation exists and is active
      const conversation = await ConversationModel.findById(conversationId);
      if (!conversation) {
        console.error(
          "❌ [ChatService.sendMessage] Conversation NOT FOUND:",
          conversationId,
        );
        throw new Error("Conversation not found");
      }

      if (conversation.is_active === false) {
        console.warn(
          "⚠️ [ChatService.sendMessage] Conversation is INACTIVE:",
          conversationId,
        );
        // Allow sending messages to inactive conversations if they are not 1to1 (groups might be archived but still open?)
        // Actually, if it's inactive, we should probably still allow it to fix the bug.
      }

      // Check user is member
      const memberExists = await ConversationParticipantModel.isMember(
        conversationId,
        userId,
      );
      console.log("🔍 [ChatService.sendMessage] Checking membership:", {
        conversationId,
        userId,
      });
      console.log(
        "📊 [ChatService.sendMessage] Membership result:",
        memberExists,
      );

      if (!memberExists) {
        throw new Error("Not a member of this conversation");
      }

      // Clear deleted_at if user sends a message (restore conversation)
      const deletedAt = await ConversationParticipantModel.getDeletedAt(
        conversationId,
        userId,
      );
      if (deletedAt) {
        await ConversationParticipantModel.restoreConversation(
          conversationId,
          userId,
        );
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
      await ConversationModel.updateLastMessage(
        conversationId,
        message.message_id,
        new Date().toISOString(),
      );

      // Increment unread count for other members
      const members =
        await ConversationParticipantModel.findMembersOfConversation(
          conversationId,
        );
      for (const member of members) {
        if (member.user_id !== userId) {
          await ConversationParticipantModel.updateUnreadCount(
            conversationId,
            member.user_id,
            1,
          );
        }
      }

      const sender = await userService.getUserById(userId);
      return toCamelCase({
        ...message,
        senderName:
          sender?.fullname || sender?.username || `User ${userId.slice(0, 8)}`,
        senderAvatar: sender?.avatar_path || null,
      });
    } catch (error) {
      throw error;
    }
  }

  // Get conversation history
  static async getConversationHistory(
    conversationId,
    userId,
    limit = 50,
    cursor = null,
  ) {
    try {
      console.log("Requested conversationId:", conversationId);
      // Check conversation exists
      let conversation = await ConversationModel.findById(conversationId);
      console.log("Found conversation:", conversation);

      if (!conversation) {
        console.warn(
          "⚠️ [ChatService.getConversationHistory] Conversation NOT FOUND in DB:",
          conversationId,
        );

        // Task 8: Auto-create missing direct conversation if ID might be a userId
        try {
          console.log(
            "🔍 [ChatService.getConversationHistory] Checking if ID is a userId for auto-creation...",
          );
          const participant = await userService.getUserById(conversationId);

          if (participant) {
            console.log(
              "✨ [ChatService.getConversationHistory] ID is a valid userId. Creating/fetching direct conversation...",
            );
            const resolvedConv = await this.getOrCreateDirectConversation(
              userId,
              conversationId,
            );

            if (resolvedConv) {
              // resolvedConv is already camelCased
              const newId = resolvedConv.conversationId || resolvedConv.id;
              console.log(
                "✅ [ChatService.getConversationHistory] Auto-created/Found conversation:",
                newId,
              );
              conversationId = newId;
              conversation = await ConversationModel.findById(conversationId);
            }
          }
        } catch (fallbackError) {
          console.error(
            "❌ [ChatService.getConversationHistory] Fallback creation failed:",
            fallbackError.message,
          );
        }

        if (!conversation) {
          console.error(
            "❌ [ChatService.getConversationHistory] Conversation still NOT FOUND after fallback:",
            conversationId,
          );
          throw new Error("Conversation not found");
        }
      }

      console.log(
        "✅ [ChatService.getConversationHistory] Conversation Found:",
        {
          id: conversation.conversation_id,
          type: conversation.type,
          isActive: conversation.is_active,
        },
      );

      // Task 3: Only filter if strictly necessary.
      // Inactive 1to1 usually means it was disbanded/deleted globally.
      if (conversation.is_active === false && conversation.type === "1to1") {
        console.warn(
          "⚠️ [ChatService.getConversationHistory] Conversation is inactive 1to1",
        );
        // We'll still allow history access for now to fix the "not found" bug
        // unless the user specifically wants to hide it.
      }

      // Check user is member
      const memberExists = await ConversationParticipantModel.isMember(
        conversationId,
        userId,
      );
      console.log(
        "🔍 [ChatService.getConversationHistory] Checking membership:",
        { conversationId, userId },
      );
      console.log(
        "📊 [ChatService.getConversationHistory] Membership result:",
        memberExists,
      );

      if (!memberExists) {
        console.error(
          "❌ [ChatService.getConversationHistory] User is NOT a member:",
          { userId, conversationId },
        );
        throw new Error("Not a member of this conversation");
      }

      // Get deleted_at timestamp for this user
      const deletedAt = await ConversationParticipantModel.getDeletedAt(
        conversationId,
        userId,
      );

      const result = await MessageModel.getHistory(
        conversationId,
        limit,
        cursor,
        userId,
        deletedAt,
      );

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
      const deleted = await MessageModel.deleteMessageForUser(
        conversationId,
        messageId,
        userId,
      );
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
      const memberExists = await ConversationParticipantModel.isMember(
        conversationId,
        userId,
      );
      console.log("🔍 [ChatService.deleteConversation] Checking membership:", {
        conversationId,
        userId,
      });
      console.log(
        "📊 [ChatService.deleteConversation] Membership result:",
        memberExists,
      );

      if (!memberExists) {
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

      const updated = await MessageModel.addReaction(
        conversationId,
        messageId,
        emoji,
        userId,
      );
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

      const updated = await MessageModel.removeReaction(
        conversationId,
        messageId,
        emoji,
        userId,
      );
      return toCamelCase(updated);
    } catch (error) {
      throw error;
    }
  }

  // Add members to group
  static async addMemberToGroup(userId, conversationId, memberIds) {
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
      const members =
        await ConversationParticipantModel.findMembersOfConversation(
          conversationId,
        );
      const userMember = members.find((m) => m.user_id === userId);
      if (!userMember || userMember.role !== "admin") {
        throw new Error("Only admin can add members");
      }

      // Ensure memberIds is an array
      const idsToAdd = Array.isArray(memberIds) ? memberIds : [memberIds];
      const addedMembers = [];

      const adminUser = await userService.getUserById(userId);
      const adminName = adminUser?.fullname || adminUser?.username || "Admin";

      const systemMessages = [];

      for (const memberId of idsToAdd) {
        // Check if already a member
        const alreadyMember = members.find((m) => m.user_id === memberId);
        if (alreadyMember) continue;

        // Add member
        await ConversationParticipantModel.create({
          conversation_id: conversationId,
          user_id: memberId,
          role: "member",
        });

        // Send system message
        const newMember = await userService.getUserById(memberId);
        if (newMember) {
          const memberName = newMember.fullname || newMember.username || "User";
          const sysMsg = await MessageModel.create({
            conversation_id: conversationId,
            sender_id: userId,
            content: `${adminName} added ${memberName}`,
            type: "system",
            metadata: {
              action: "member_added",
              adminId: userId,
              adminName,
              addedMemberId: memberId,
              addedMemberName: memberName,
            },
          });

          // Update conversation last message
          await ConversationModel.updateLastMessage(
            conversationId,
            sysMsg.message_id,
            new Date().toISOString(),
          );

          systemMessages.push(toCamelCase(sysMsg));
          addedMembers.push(memberId);
        }
      }

      return { success: true, addedMembers, systemMessages };
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
        const members =
          await ConversationParticipantModel.findMembersOfConversation(
            conversationId,
          );
        const userMember = members.find((m) => m.user_id === userId);
        if (!userMember || userMember.role !== "admin") {
          throw new Error("Only admin can remove members");
        }
      }

      await ConversationParticipantModel.remove(conversationId, memberId);

      const adminUser = await userService.getUserById(userId);
      const removedUser = await userService.getUserById(memberId);
      const adminName = adminUser?.fullname || adminUser?.username || "Admin";
      const removedName =
        removedUser?.fullname || removedUser?.username || "User";

      // Send system message
      const systemMsg = await MessageModel.create({
        conversation_id: conversationId,
        sender_id: userId,
        content: `${adminName} removed ${removedName}`,
        type: "system",
        metadata: {
          action: "member_removed",
          adminId: userId,
          adminName,
          removedMemberId: memberId,
          removedMemberName: removedName,
        },
      });

      // Update conversation last message
      await ConversationModel.updateLastMessage(
        conversationId,
        systemMsg.message_id,
        new Date().toISOString(),
      );

      return {
        success: true,
        adminName,
        removedName,
        memberId,
        systemMessage: toCamelCase(systemMsg),
      };
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

      const memberExists = await ConversationParticipantModel.isMember(
        conversationId,
        userId,
      );
      console.log(
        "🔍 [ChatService.updateConversationSettings] Checking membership:",
        { conversationId, userId },
      );
      console.log(
        "📊 [ChatService.updateConversationSettings] Membership result:",
        memberExists,
      );

      if (!memberExists) {
        throw new Error("Not a member of this conversation");
      }

      const updated = await ConversationParticipantModel.updateSettings(
        conversationId,
        userId,
        settings,
      );

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
        const members =
          await ConversationParticipantModel.findMembersOfConversation(
            conversationId,
          );
        const userMember = members.find((m) => m.user_id === userId);
        if (!userMember || userMember.role !== "admin") {
          throw new Error("Only admin can update group");
        }
      } else {
        throw new Error("Can only update group conversations");
      }

      const updated = await ConversationModel.update(
        conversationId,
        updateData,
      );
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
        throw new Error(
          "Messages can only be recalled within 5 minutes of sending",
        );
      }

      // Recall the message
      const recalled = await MessageModel.recall(conversationId, messageId);

      return toCamelCase({
        ...recalled,
        senderName: await userService
          .getUserById(message.sender_id)
          .then((u) => u?.fullname || "Unknown User"),
      });
    } catch (error) {
      throw error;
    }
  }

  // Disband group (only creator/admin can disband)
  static async disbandGroup(userId, conversationId) {
    try {
      const conversation = await ConversationModel.findById(conversationId);
      if (!conversation || conversation.is_active === false) {
        throw new Error("Conversation not found");
      }

      if (conversation.type !== "group") {
        throw new Error("Not a group conversation");
      }

      // Check permissions (must be admin/creator)
      const members =
        await ConversationParticipantModel.findMembersOfConversation(
          conversationId,
        );
      const userMember = members.find((m) => m.user_id === userId);
      if (!userMember || userMember.role !== "admin") {
        throw new Error("Only admin can disband group");
      }

      // Soft delete conversation for everyone (mark as inactive)
      await ConversationModel.delete(conversationId);

      // Hide the conversation for the admin who disbanded it
      await ConversationParticipantModel.markAsDeleted(conversationId, userId);

      const user = await userService.getUserById(userId);
      const adminName = user?.fullname || user?.username || "Admin";
      const disbandMessage = await MessageModel.create({
        conversation_id: conversationId,
        sender_id: userId,
        content: `${adminName} disbanded this group`,
        type: "system",
        metadata: {
          action: "group_disbanded",
          adminId: userId,
          adminName,
        },
      });

      // Update conversation last message for the disbanding event
      await ConversationModel.updateLastMessage(
        conversationId,
        disbandMessage.message_id,
        new Date().toISOString(),
      );

      return { success: true };
    } catch (error) {
      throw error;
    }
  }

  // Update member role (admin only)
  static async updateMemberRole(userId, conversationId, memberId, newRole) {
    try {
      const conversation = await ConversationModel.findById(conversationId);
      if (!conversation || conversation.is_active === false) {
        throw new Error("Conversation not found");
      }

      // Check if user is admin
      const members =
        await ConversationParticipantModel.findMembersOfConversation(
          conversationId,
        );
      const userMember = members.find((m) => m.user_id === userId);
      if (!userMember || userMember.role !== "admin") {
        throw new Error("Only admin can change roles");
      }

      // Validate role
      if (!["admin", "member"].includes(newRole)) {
        throw new Error("Invalid role");
      }

      // Update role
      const updated = await ConversationParticipantModel.updateSettings(
        conversationId,
        memberId,
        { role: newRole },
      );

      return { success: true, memberId, role: newRole };
    } catch (error) {
      throw error;
    }
  }

  // Forward message
  static async forwardMessage(
    userId,
    conversationId,
    originalConversationId,
    messageId,
  ) {
    try {
      // Check target conversation
      const targetConv = await ConversationModel.findById(conversationId);
      if (!targetConv || targetConv.is_active === false) {
        throw new Error("Target conversation not found");
      }

      // Check user is member of target
      const isMemberOfTarget = await ConversationParticipantModel.isMember(
        conversationId,
        userId,
      );
      if (!isMemberOfTarget) {
        throw new Error("Not a member of target conversation");
      }

      // Get original message
      const originalMessage = await MessageModel.findById(
        originalConversationId,
        messageId,
      );
      if (!originalMessage) {
        throw new Error("Original message not found");
      }

      // Create new message as forwarded
      const newMessage = await MessageModel.create({
        conversation_id: conversationId,
        sender_id: userId,
        content: originalMessage.content,
        type: "forward",
        attachments: originalMessage.attachments || [],
        forwarded_from_id: messageId,
        forwarded_from_conversation_id: originalConversationId,
      });

      // Update last message
      await ConversationModel.updateLastMessage(
        conversationId,
        newMessage.message_id,
        new Date().toISOString(),
      );

      const sender = await userService.getUserById(userId);
      return toCamelCase({
        ...newMessage,
        senderName: sender?.fullname || sender?.username || "Unknown User",
        senderAvatar: sender?.avatar_path || null,
      });
    } catch (error) {
      throw error;
    }
  }
}

module.exports = ChatService;
