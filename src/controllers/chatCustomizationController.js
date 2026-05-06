const ConversationSettings = require("@models/conversationSettingsModel");
const ConversationNotificationSettings = require("@models/conversationNotificationSettingsModel");
const { uploadToS3 } = require("@config/multer");
const { getCurrentUserId } = require("@utils/authUtils");

// ============================================================
// FEATURE 1: CHAT THEME / BACKGROUND
// ============================================================

/**
 * GET /api/conversations/:conversationId/theme
 * Get the current user's theme for a conversation
 */
const getConversationTheme = async (req, res) => {
    try {
        const userId = getCurrentUserId(req);
        const { conversationId } = req.params;
        console.log(`[CHAT DEBUG] getConversationTheme - userId: ${userId}, conversationId: ${conversationId}`);

        const settings = await ConversationSettings.findOne({
            where: { user_id: userId, conversation_id: conversationId },
        });

        if (!settings) {
            return res.status(200).json({
                success: true,
                data: {
                    theme_type: "default",
                    background_color: null,
                    background_image: null,
                    gradient_start: null,
                    gradient_end: null,
                },
            });
        }

        res.status(200).json({
            success: true,
            data: settings,
        });
    } catch (error) {
        console.error("getConversationTheme error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * PUT /api/conversations/:conversationId/theme
 * Update the current user's theme for a conversation.
 * Supports JSON (color/gradient) and multipart/form-data (image upload).
 */
const updateConversationTheme = async (req, res) => {
    try {
        const userId = getCurrentUserId(req);
        const { conversationId } = req.params;
        console.log(`[CHAT DEBUG] updateConversationTheme - userId: ${userId}, conversationId: ${conversationId}`);
        const { themeType, backgroundColor, gradientStart, gradientEnd } = req.body;
        const io = req.app.get("io");

        console.log("[CHAT SETTINGS] incoming theme update:", req.body);

        const VALID_THEME_TYPES = ["default", "dark", "gradient", "color", "image"];
        if (!themeType || !VALID_THEME_TYPES.includes(themeType)) {
            return res.status(400).json({
                success: false,
                message: `themeType must be one of: ${VALID_THEME_TYPES.join(", ")}`,
            });
        }

        const updatePayload = {
            user_id: userId,
            conversation_id: conversationId,
            theme_type: themeType,
            background_color: backgroundColor || null,
            background_image: null,
            gradient_start: gradientStart || null,
            gradient_end: gradientEnd || null,
        };

        // Handle image upload if themeType is "image"
        if (themeType === "image") {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message: "An image file is required when themeType is 'image'",
                });
            }
            try {
                const imageUrl = await uploadToS3(req.file, `chat-backgrounds/${userId}`);
                updatePayload.background_image = imageUrl;
            } catch (uploadError) {
                console.error("S3 upload error:", uploadError);
                return res.status(500).json({
                    success: false,
                    message: `Failed to upload background image: ${uploadError.message}`,
                });
            }
        }

        const beforeTheme = await ConversationSettings.findOne({
            where: { user_id: userId, conversation_id: conversationId }
        });
        console.log("before:", beforeTheme ? beforeTheme.toJSON() : null);

        // Upsert into MySQL
        const [settings, created] = await ConversationSettings.upsert(updatePayload, {
            returning: true,
        });
        
        console.log("after:", settings ? settings.toJSON() : null);

        // Emit socket event to THIS user's personal room only (theme is private)
        if (io) {
            io.to(`user:${userId}`).emit("theme_updated", {
                conversationId,
                userId,
                themeType: updatePayload.theme_type,
                backgroundColor: updatePayload.background_color,
                backgroundImage: updatePayload.background_image,
                gradientStart: updatePayload.gradient_start,
                gradientEnd: updatePayload.gradient_end,
                timestamp: new Date().toISOString(),
            });
        }

        res.status(200).json({
            success: true,
            data: {
                conversationId,
                themeType: updatePayload.theme_type,
                backgroundColor: updatePayload.background_color,
                backgroundImage: updatePayload.background_image,
                gradientStart: updatePayload.gradient_start,
                gradientEnd: updatePayload.gradient_end,
            },
            message: "Theme updated successfully",
        });
    } catch (error) {
        console.error("updateConversationTheme error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ============================================================
// FEATURE 2: MUTE / NOTIFICATION SETTINGS
// ============================================================

/**
 * GET /api/conversations/:conversationId/settings
 * Get the current user's theme and mute status for a conversation
 */
const getConversationSettings = async (req, res) => {
    try {
        const userId = getCurrentUserId(req);
        const { conversationId } = req.params;
        console.log(`[CHAT DEBUG] getConversationSettings - userId: ${userId}, conversationId: ${conversationId}`);

        // Fetch Theme Settings
        const themeSettings = await ConversationSettings.findOne({
            where: { user_id: userId, conversation_id: conversationId },
        });

        // Fetch Notification Settings
        const notificationSettings = await ConversationNotificationSettings.findOne({
            where: { user_id: userId, conversation_id: conversationId },
        });

        const now = new Date();
        let isMuted = false;
        let muteUntil = null;
        let isMutedForever = false;

        if (notificationSettings) {
            isMutedForever = notificationSettings.is_muted_forever;
            muteUntil = notificationSettings.mute_until;

            if (isMutedForever) {
                isMuted = true;
            } else if (muteUntil && new Date(muteUntil) > now) {
                isMuted = true;
            }
        }

        res.status(200).json({
            success: true,
            data: {
                theme: themeSettings || {
                    theme_type: "default",
                    background_color: null,
                    background_image: null,
                    gradient_start: null,
                    gradient_end: null,
                },
                notifications: {
                    isMuted,
                    muteUntil: muteUntil ? (muteUntil instanceof Date ? muteUntil.toISOString() : new Date(muteUntil).toISOString()) : null,
                    isMutedForever,
                },
            },
        });
    } catch (error) {
        console.error("getConversationSettings error:", error);
        res.status(500).json({ success: false, message: "Failed to retrieve conversation settings: " + error.message });
    }
};

/**
 * GET /api/conversations/:conversationId/notifications
 * @deprecated Use GET /api/conversations/:conversationId/settings
 */
const getNotificationSettings = async (req, res) => {
    try {
        const userId = req.user.user_id;
        const { conversationId } = req.params;

        const settings = await ConversationNotificationSettings.findOne({
            where: { user_id: userId, conversation_id: conversationId },
        });

        const now = new Date();
        let isMuted = false;
        let muteUntil = null;
        let isMutedForever = false;

        if (settings) {
            isMutedForever = settings.is_muted_forever;
            muteUntil = settings.mute_until;

            if (isMutedForever) {
                isMuted = true;
            } else if (muteUntil && new Date(muteUntil) > now) {
                isMuted = true;
            }
        }

        res.status(200).json({
            success: true,
            data: {
                isMuted,
                muteUntil: muteUntil ? (muteUntil instanceof Date ? muteUntil.toISOString() : new Date(muteUntil).toISOString()) : null,
                isMutedForever,
            },
        });
    } catch (error) {
        console.error("getNotificationSettings error:", error);
        res.status(500).json({ success: false, message: "Failed to retrieve notification settings: " + error.message });
    }
};

/**
 * PUT /api/conversations/:conversationId/notifications
 * Mute or unmute notifications for a conversation.
 * type: "1_hour" | "8_hours" | "24_hours" | "forever" | "unmute"
 */
const updateNotificationSettings = async (req, res) => {
    try {
        const userId = getCurrentUserId(req);
        const { conversationId } = req.params;
        console.log(`[CHAT DEBUG] updateNotificationSettings - userId: ${userId}, conversationId: ${conversationId}`);
        const { type } = req.body;
        const io = req.app.get("io");

        console.log("[CHAT SETTINGS] incoming mute update:", req.body);

        const VALID_TYPES = ["1_hour", "8_hours", "24_hours", "forever", "unmute"];
        if (!type || !VALID_TYPES.includes(type)) {
            return res.status(400).json({
                success: false,
                message: `type must be one of: ${VALID_TYPES.join(", ")}`,
            });
        }

        let muteUntil = null;
        let isMutedForever = false;

        const now = new Date();

        switch (type) {
            case "1_hour":
                muteUntil = new Date(now.getTime() + 60 * 60 * 1000);
                break;
            case "8_hours":
                muteUntil = new Date(now.getTime() + 8 * 60 * 60 * 1000);
                break;
            case "24_hours":
                muteUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000);
                break;
            case "forever":
                isMutedForever = true;
                muteUntil = null;
                break;
            case "unmute":
                muteUntil = null;
                isMutedForever = false;
                break;
        }

        console.log(`[NotificationSettings] Updating for user ${userId}, conversation ${conversationId}, type ${type}`);

        // Use findOne and update/create instead of upsert for better control and error reporting
        let settings = await ConversationNotificationSettings.findOne({
            where: { user_id: userId, conversation_id: conversationId }
        });
        
        console.log("before:", settings ? settings.toJSON() : null);

        if (settings) {
            settings = await settings.update({
                mute_until: muteUntil,
                is_muted_forever: isMutedForever,
            });
        } else {
            settings = await ConversationNotificationSettings.create({
                user_id: userId,
                conversation_id: conversationId,
                mute_until: muteUntil,
                is_muted_forever: isMutedForever,
            });
        }
        
        console.log("after:", settings ? settings.toJSON() : null);

        const isMuted = type !== "unmute";

        // IMPORTANT: Also update DynamoDB (ConversationParticipantModel) so the conversation list (sidebar) reflects the mute status
        try {
            const ConversationParticipantModelDynamo = require("@models/ConversationParticipantModel");
            await ConversationParticipantModelDynamo.updateSettings(conversationId, userId, {
                is_muted: isMuted
            });
            console.log(`[NotificationSettings] Synced is_muted=${isMuted} to DynamoDB`);
        } catch (dynamoError) {
            console.error("[NotificationSettings] Failed to sync to DynamoDB (non-fatal):", dynamoError.message);
        }

        // Emit socket event to THIS user's personal room only (mute is private)
        if (io) {
            io.to(`user:${userId}`).emit("notification_settings_updated", {
                conversationId,
                userId,
                type,
                isMuted,
                muteUntil: muteUntil ? muteUntil.toISOString() : null,
                isMutedForever,
                timestamp: new Date().toISOString(),
            });
        }

        res.status(200).json({
            success: true,
            data: {
                conversationId,
                type,
                isMuted,
                muteUntil: muteUntil ? muteUntil.toISOString() : null,
                isMutedForever,
            },
            message: type === "unmute" ? "Notifications unmuted" : `Notifications muted until ${type === 'forever' ? 'forever' : muteUntil.toLocaleString()}`,
        });
    } catch (error) {
        console.error("updateNotificationSettings error:", error);
        res.status(500).json({ 
            success: false, 
            message: "Failed to update notification settings: " + error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

/**
 * Utility: Check if a user has muted a conversation
 * Used internally to gate push notification delivery
 * @param {string} userId
 * @param {string} conversationId
 * @returns {Promise<boolean>}
 */
const isConversationMuted = async (userId, conversationId) => {
    try {
        const settings = await ConversationNotificationSettings.findOne({
            where: { user_id: userId, conversation_id: conversationId },
        });

        if (!settings) return false;
        if (settings.is_muted_forever) return true;
        if (settings.mute_until && new Date(settings.mute_until) > new Date()) return true;
        return false;
    } catch (error) {
        console.error("isConversationMuted error:", error);
        return false; // fail open — don't block delivery on error
    }
};

module.exports = {
    getConversationSettings,
    getConversationTheme,
    getNotificationSettings,
    updateConversationTheme,
    updateNotificationSettings,
    isConversationMuted,
};
