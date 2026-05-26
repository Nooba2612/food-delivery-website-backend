const ChatService = require("./chat.service");
const { uploadToS3 } = require("@core/config/multer");
const websocket = require("@core/websocket");

// Get user's conversations
const getConversations = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { limit = 20, cursor } = req.query;

    const result = await ChatService.getUserConversations(
      userId,
      parseInt(limit),
      cursor,
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get conversations by userId
const getConversationsByUserId = async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 20, cursor } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId is required",
      });
    }

    const result = await ChatService.getUserConversations(
      userId,
      parseInt(limit),
      cursor,
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get or create 1-to-1 conversation
const getOrCreateDirectConversation = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { participantId } = req.body;

    if (!participantId) {
      return res.status(400).json({
        success: false,
        message: "participantId is required",
      });
    }

    const conversation = await ChatService.getOrCreateDirectConversation(
      userId,
      participantId,
    );

    res.status(200).json({
      success: true,
      data: conversation,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Create group conversation
const createGroupConversation = async (req, res) => {
  try {
    const userId = req.user.user_id;
    let { name, participantIds } = req.body;
    let avatarPath = null;

    // participantIds might be a JSON string if sent via FormData
    if (typeof participantIds === "string") {
      try {
        participantIds = JSON.parse(participantIds);
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: "Invalid participantIds format. Expected a JSON array.",
        });
      }
    }

    if (!name || !participantIds || !Array.isArray(participantIds)) {
      return res.status(400).json({
        success: false,
        message: "name and participantIds (array) are required",
      });
    }

    if (req.file) {
      try {
        avatarPath = await uploadToS3(req.file, "conversations");
      } catch (error) {
        console.error("Failed to upload conversation avatar:", error);
        return res.status(500).json({
          success: false,
          message: `Failed to upload avatar: ${error.message}`,
        });
      }
    }

    const conversation = await ChatService.createGroupConversation(
      userId,
      name,
      participantIds,
      avatarPath,
    );

    // Emit WebSocket event to all participants
    const io = req.app.get("io");
    if (io) {
      websocket.emitNewConversation(io, participantIds, conversation);
    }

    res.status(201).json({
      success: true,
      data: conversation,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get conversation details
const getConversationDetails = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { conversationId } = req.body;

    if (!conversationId) {
      return res.status(400).json({
        success: false,
        message: "conversationId is required",
      });
    }

    const conversation = await ChatService.getConversationDetails(
      conversationId,
      userId,
    );

    res.status(200).json({
      success: true,
      data: conversation,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// Get messages in conversation
const getMessages = async (req, res) => {
  try {
    const userId = req.user.user_id || req.user.id;
    const { conversationId } = req.params;
    const { limit = 50, cursor } = req.query;

    console.log("📨 [getMessages] Fetching messages:", {
      conversationId,
      userId,
      limit,
      cursor,
    });

    if (!conversationId) {
      return res.status(400).json({
        success: false,
        message: "conversationId is required",
      });
    }

    console.log("🔍 [getMessages] Requested conversationId:", conversationId);
    const result = await ChatService.getConversationHistory(
      conversationId,
      userId,
      parseInt(limit),
      cursor,
    );

    console.log(
      `✅ [getMessages] Retrieved ${result.messages?.length || 0} messages`,
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("❌ [getMessages] Error:", error.message);
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// Send message
const sendMessage = async (req, res) => {
  try {
    const userId = req.user.user_id || req.user.id;
    const { conversationId } = req.params;

    // Normalize content from various possible field names
    const content = req.body.content || req.body.message || req.body.text || "";
    const type = req.body.type || "text";
    const mentions = req.body.mentions
      ? typeof req.body.mentions === "string"
        ? JSON.parse(req.body.mentions)
        : req.body.mentions
      : [];
    const replyToId = req.body.replyToId || req.body.reply_to_id;

    const io = req.app.get("io");

    console.log("📤 [sendMessage] Incoming message:", {
      conversationId,
      userId,
      contentLength: content?.length,
      type,
      hasFiles: !!(req.files && req.files.length > 0),
    });

    // Content is required only if there are no attachments
    if (!content && (!req.files || req.files.length === 0)) {
      return res.status(400).json({
        success: false,
        message: "content or attachments are required",
      });
    }

    // Upload files to S3 and build attachments array
    const attachments = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        try {
          const fileUrl = await uploadToS3(file, `messages/${conversationId}`);
          attachments.push({
            fileName: file.originalname,
            fileSize: file.size,
            mimeType: file.mimetype,
            fileUrl, // S3 URL
          });
        } catch (error) {
          console.error(`Failed to upload file ${file.originalname}:`, error);
          return res.status(500).json({
            success: false,
            message: `Failed to upload file ${file.originalname}: ${error.message}`,
          });
        }
      }
    }

    const message = await ChatService.sendMessage(userId, conversationId, {
      content: content || "",
      type:
        attachments.length > 0
          ? attachments[0].mimeType?.startsWith("image")
            ? "image"
            : "file"
          : type,
      mentions,
      replyToId,
      attachments,
    });

    // Emit real-time message to all users in conversation
    if (io) {
      const {
        emitMessageToConversation,
        emitConversationUpdated,
      } = require("@core/websocket");
      const ConversationParticipantModel = require("./models/conversationParticipantModel");

      emitMessageToConversation(io, conversationId, message);

      // Emit conversation update to all members for conversation list refresh
      const members =
        await ConversationParticipantModel.findMembersOfConversation(
          conversationId,
        );

      // Build lastMessage object for each member
      for (const member of members) {
        const unreadCount =
          member.user_id !== userId ? (member.unread_count || 0) + 1 : 0;

        emitConversationUpdated(io, conversationId, [member.user_id], {
          lastMessage: {
            messageId: message.messageId,
            content:
              message.content ||
              (attachments.length > 0
                ? `[${attachments[0].mimeType?.startsWith("image") ? "Image" : "File"}]`
                : ""),
            type: message.type,
            senderName: message.senderName,
            senderAvatar: message.senderAvatar,
            createdAt: message.createdAt,
            attachments: message.attachments,
          },
          lastMessageTimestamp: message.createdAt,
          lastMessageId: message.messageId,
          unreadCount,
        });
      }
    }

    res.status(201).json({
      success: true,
      data: message,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Create a call message bubble after call ends
 * POST /api/messages/:conversationId/call
 */
const createCallMessage = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { conversationId } = req.params;
    const { callId, callType, callStatus, durationSeconds } = req.body;
    const io = req.app.get("io");

    // Validate required fields
    if (!callId) {
      return res.status(400).json({
        success: false,
        message: "callId is required",
      });
    }

    if (!["voice", "video"].includes(callType)) {
      return res.status(400).json({
        success: false,
        message: "callType must be 'voice' or 'video'",
      });
    }

    if (!["accepted", "cancelled", "rejected", "missed"].includes(callStatus)) {
      return res.status(400).json({
        success: false,
        message:
          "callStatus must be 'accepted', 'cancelled', 'rejected', or 'missed'",
      });
    }

    if (durationSeconds === undefined || durationSeconds < 0) {
      return res.status(400).json({
        success: false,
        message: "durationSeconds must be a non-negative number",
      });
    }

    // Check if user is member of conversation
    const ConversationModel = require("./models/conversationModel");
    const conversation = await ConversationModel.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
    }

    // Format call message
    const icon = callType === "video" ? "📹" : "📞";
    const callTypeText = callType === "video" ? "Video call" : "Voice call";

    // Format duration
    const formatDuration = (seconds) => {
      if (!seconds || seconds <= 0) return "0s";
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      if (mins > 0) {
        return `${mins}m ${secs}s`;
      }
      return `${secs}s`;
    };

    const duration = formatDuration(durationSeconds);
    const statusText = callStatus !== "accepted" ? ` • ${callStatus}` : "";
    const content = `${icon} ${callTypeText} • ${duration}${statusText}`;

    // Create message in database
    const message = await ChatService.sendMessage(userId, conversationId, {
      content,
      type: "call",
      callData: {
        callId,
        callType,
        callStatus,
        durationSeconds,
      },
    });

    // Broadcast via WebSocket
    if (io) {
      const { emitMessageToConversation } = require("@core/websocket");
      emitMessageToConversation(io, conversationId, message);
    }

    res.status(201).json({
      success: true,
      data: message,
    });
  } catch (error) {
    console.error("Error creating call message:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to create call message",
    });
  }
};

// Edit message
const editMessage = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { conversationId, messageId } = req.params;
    const { content } = req.body;
    const io = req.app.get("io");

    if (!content) {
      return res.status(400).json({
        success: false,
        message: "content is required",
      });
    }

    const updated = await ChatService.editMessage(
      userId,
      conversationId,
      messageId,
      content,
    );

    // Emit real-time message edited event
    if (io) {
      const { emitMessageEdited } = require("@core/websocket");
      emitMessageEdited(io, conversationId, updated);
    }

    res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// Delete message
const deleteMessage = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { conversationId, messageId } = req.params;
    const io = req.app.get("io");

    await ChatService.deleteMessage(userId, conversationId, messageId);

    // Emit real-time message deleted event with deleted_by info
    if (io) {
      const { emitMessageDeleted } = require("@core/websocket");
      emitMessageDeleted(io, conversationId, messageId, userId);
    }

    res.status(200).json({
      success: true,
      message: "Message deleted successfully",
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// Recall message (within 5 minutes)
const recallMessage = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { conversationId, messageId } = req.params;
    const io = req.app.get("io");

    const recalled = await ChatService.recallMessage(
      userId,
      conversationId,
      messageId,
    );

    // Emit real-time message recalled event
    if (io) {
      const { emitMessageRecalled } = require("@core/websocket");
      emitMessageRecalled(io, conversationId, messageId);
    }

    res.status(200).json({
      success: true,
      message: "Message recalled successfully",
      data: recalled,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// Mark messages as read
const markMessagesAsRead = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { conversationId } = req.params;
    const { messageIds } = req.body;

    if (!messageIds || messageIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "messageIds array is required",
      });
    }

    const result = await ChatService.markMessagesAsRead(
      userId,
      conversationId,
      messageIds,
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

// Mark entire conversation as read
const markConversationAsRead = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { conversationId } = req.params;

    const result = await ChatService.markConversationAsRead(
      userId,
      conversationId,
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

// Add reaction to message
const addReaction = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { conversationId, messageId } = req.params;
    const { emoji } = req.body;
    const io = req.app.get("io");

    if (!emoji) {
      return res.status(400).json({
        success: false,
        message: "emoji is required",
      });
    }

    const updated = await ChatService.addReaction(
      userId,
      conversationId,
      messageId,
      emoji,
    );

    // Emit real-time reaction added event
    if (io) {
      const { emitReactionAdded } = require("@core/websocket");
      emitReactionAdded(io, conversationId, {
        messageId,
        userId,
        emoji,
        reactions: updated.reactions,
      });
    }

    res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// Remove reaction from message
const removeReaction = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { conversationId, messageId } = req.params;
    const { emoji } = req.body;
    const io = req.app.get("io");

    if (!emoji) {
      return res.status(400).json({
        success: false,
        message: "emoji is required",
      });
    }

    const updated = await ChatService.removeReaction(
      userId,
      conversationId,
      messageId,
      emoji,
    );

    // Emit real-time reaction removed event
    if (io) {
      const { emitReactionRemoved } = require("@core/websocket");
      emitReactionRemoved(io, conversationId, {
        messageId,
        userId,
        emoji,
        reactions: updated.reactions,
      });
    }

    res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// Add member to group
const addMemberToGroup = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { conversationId } = req.params;
    const { memberIds } = req.body;
    const io = req.app.get("io");

    if (!memberIds) {
      return res.status(400).json({
        success: false,
        message: "memberIds are required",
      });
    }

    const result = await ChatService.addMemberToGroup(
      userId,
      conversationId,
      memberIds,
    );

    // Emit real-time member added event
    if (io) {
      const {
        emitMemberAdded,
        emitMessageToConversation,
        emitConversationUpdated,
      } = require("@core/websocket");
      const ids = Array.isArray(memberIds) ? memberIds : [memberIds];

      // Fetch updated member list to notify everyone
      const members =
        await require("./models/conversationParticipantModel").findMembersOfConversation(
          conversationId,
        );
      const allMemberIds = members.map((m) => m.user_id);

      for (const memberId of ids) {
        emitMemberAdded(io, conversationId, {
          memberId,
          joinedAt: new Date().toISOString(),
        });

        // Notify the newly added user to refresh their conversation list
        const userRoom = `user:${memberId}`;
        io.to(userRoom).emit("member_added_to_new_group", {
          conversationId,
          addedBy: userId,
        });
      }

      // Broadcast system messages
      for (const sysMsg of result.systemMessages || []) {
        emitMessageToConversation(io, conversationId, sysMsg);

        emitConversationUpdated(io, conversationId, allMemberIds, {
          lastMessage: sysMsg,
          lastMessageTimestamp: sysMsg.createdAt,
          unreadCount: 0,
        });
      }
    }

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

// Remove member from group
const removeMemberFromGroup = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { conversationId } = req.params;
    const { memberId } = req.body;
    const io = req.app.get("io");

    if (!memberId) {
      return res.status(400).json({
        success: false,
        message: "memberId is required",
      });
    }

    const result = await ChatService.removeMemberFromGroup(
      userId,
      conversationId,
      memberId,
    );

    // Emit real-time member removed event
    if (io) {
      const {
        emitMemberRemoved,
        emitConversationUpdated,
        emitMessageToConversation,
      } = require("@core/websocket");

      // 1. Notify the whole conversation room about the removal
      emitMemberRemoved(io, conversationId, memberId);

      // 1.5. Broadcast the system message to the conversation
      if (result.systemMessage) {
        emitMessageToConversation(io, conversationId, result.systemMessage);
      }

      // 2. Also notify the removed member's personal room (important for real-time kick)
      const userRoom = `user:${memberId}`;
      io.to(userRoom).emit("member_removed", {
        conversationId,
        memberId,
        wasKicked: true,
        timestamp: new Date().toISOString(),
      });

      // 3. Update conversation list for remaining members
      const members =
        await require("./models/conversationParticipantModel").findMembersOfConversation(
          conversationId,
        );
      const remainingMemberIds = members.map((m) => m.user_id);

      emitConversationUpdated(io, conversationId, remainingMemberIds, {
        lastMessage: result.systemMessage,
        lastMessageTimestamp: result.systemMessage.createdAt,
        unreadCount: 0,
      });

      // 4. Update conversation list for the removed member (show them they were kicked)
      emitConversationUpdated(io, conversationId, [memberId], {
        lastMessage: {
          ...result.systemMessage,
          content: `You were removed from the group by ${result.adminName}`,
        },
        lastMessageTimestamp: result.systemMessage.createdAt,
        unreadCount: 0,
      });
    }

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

// Update conversation settings
const updateConversationSettings = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { conversationId } = req.params;
    const { isMuted, isPinned } = req.body;

    const result = await ChatService.updateConversationSettings(
      userId,
      conversationId,
      {
        is_muted: isMuted,
        is_pinned: isPinned,
      },
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

// Update conversation (name/avatar)
const updateConversation = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { conversationId } = req.params;
    const { name } = req.body;

    const updateData = {};
    if (name) updateData.name = name;
    if (req.file) {
      try {
        updateData.avatar_path = await uploadToS3(req.file, "conversations");
      } catch (error) {
        console.error("Failed to upload conversation avatar:", error);
        return res.status(500).json({
          success: false,
          message: `Failed to upload avatar: ${error.message}`,
        });
      }
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: "Nothing to update",
      });
    }

    const updated = await ChatService.updateConversation(
      userId,
      conversationId,
      updateData,
    );

    res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// Delete conversation (archive)
const deleteConversation = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { conversationId } = req.params;

    const result = await ChatService.deleteConversation(userId, conversationId);

    res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// Disband group
const disbandGroup = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { conversationId } = req.params;
    const io = req.app.get("io");

    const result = await ChatService.disbandGroup(userId, conversationId);

    // Emit real-time group disbanded event
    if (io) {
      const {
        emitGroupDisbanded,
        emitConversationUpdated,
      } = require("@core/websocket");
      emitGroupDisbanded(io, conversationId);

      // Notify all members about the disbanding message in sidebar
      const members =
        await require("./models/conversationParticipantModel").findMembersOfConversation(
          conversationId,
        );
      const memberIds = members.map((m) => m.user_id);

      emitConversationUpdated(io, conversationId, memberIds, {
        lastMessage: {
          content: "This group was disbanded",
          type: "system",
          createdAt: new Date().toISOString(),
        },
        lastMessageTimestamp: new Date().toISOString(),
        unreadCount: 0, // Everyone can see it's disbanded
      });
    }

    res.status(200).json({
      success: true,
      message: "Group disbanded successfully",
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// Update member role
const updateMemberRole = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { conversationId } = req.params;
    const { memberId, role } = req.body;
    const io = req.app.get("io");

    if (!memberId || !role) {
      return res.status(400).json({
        success: false,
        message: "memberId and role are required",
      });
    }

    const result = await ChatService.updateMemberRole(
      userId,
      conversationId,
      memberId,
      role,
    );

    // Emit real-time role updated event
    if (io) {
      const { emitMemberRoleUpdated } = require("@core/websocket");
      emitMemberRoleUpdated(io, conversationId, { memberId, role });
    }

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

// Forward message
const forwardMessage = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { conversationId } = req.params;
    const { originalConversationId, messageId } = req.body;
    const io = req.app.get("io");

    if (!originalConversationId || !messageId) {
      return res.status(400).json({
        success: false,
        message: "originalConversationId and messageId are required",
      });
    }

    const message = await ChatService.forwardMessage(
      userId,
      conversationId,
      originalConversationId,
      messageId,
    );

    // Emit real-time message to all users in conversation
    if (io) {
      const { emitMessageToConversation } = require("@core/websocket");
      emitMessageToConversation(io, conversationId, message);
    }

    res.status(201).json({
      success: true,
      data: message,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  getConversations,
  getConversationsByUserId,
  getOrCreateDirectConversation,
  createGroupConversation,
  getConversationDetails,
  getMessages,
  sendMessage,
  createCallMessage,
  editMessage,
  deleteMessage,
  recallMessage,
  markMessagesAsRead,
  markConversationAsRead,
  addReaction,
  removeReaction,
  addMemberToGroup,
  removeMemberFromGroup,
  updateConversationSettings,
  updateConversation,
  deleteConversation,
  disbandGroup,
  updateMemberRole,
  forwardMessage,
};
