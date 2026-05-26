require("dotenv").config();
const AWS = require("aws-sdk");

// Configure AWS
AWS.config.update({
    region: process.env.AWS_REGION || "ap-southeast-1",
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

const dynamodb = new AWS.DynamoDB.DocumentClient({
    convertEmptyValues: true,
    service: new AWS.DynamoDB(),
});

const seedData = async () => {
    try {
        console.log("🌱 Seeding DynamoDB with sample data...\n");

        // Seed conversations
        await seedConversations();

        // Seed conversation participants
        await seedConversationParticipants();

        console.log("\n✅ All sample data inserted successfully!");
        process.exit(0);
    } catch (error) {
        console.error("❌ Error seeding DynamoDB:", error);
        process.exit(1);
    }
};

const seedConversations = async () => {
    const conversations = [
        {
            conversation_id: "conv-123e4567-e89b-12d3-a456-426614174000",
            title: "Order Discussion - Pizza Order #12345",
            description: "Customer support conversation",
            created_by: "user-001",
            participants: ["user-001", "user-002", "admin-001"],
            last_message_id: "msg-987f6543-e21b-45d3-b789-426614174111",
            last_message_timestamp: "2026-04-12T10:30:45.000Z",
            is_active: true,
            created_at: "2026-04-12T09:15:20.000Z",
            updated_at: "2026-04-12T10:30:45.000Z",
        },
        {
            conversation_id: "conv-223e4567-e89b-12d3-a456-426614174001",
            title: "Delivery Issue",
            description: "Late delivery problem",
            created_by: "user-002",
            participants: ["user-002", "user-003", "admin-002"],
            last_message_id: "msg-a87f6543-e21b-45d3-b789-426614174222",
            last_message_timestamp: "2026-04-12T08:45:20.000Z",
            is_active: true,
            created_at: "2026-04-12T08:00:00.000Z",
            updated_at: "2026-04-12T08:45:20.000Z",
        },
        {
            conversation_id: "conv-323e4567-e89b-12d3-a456-426614174002",
            title: "Menu Recommendation",
            description: "User asking for dish recommendations",
            created_by: "user-003",
            participants: ["user-003", "admin-001"],
            last_message_id: null,
            last_message_timestamp: null,
            is_active: true,
            created_at: "2026-04-12T11:00:00.000Z",
            updated_at: "2026-04-12T11:00:00.000Z",
        },
    ];

    console.log("📝 Inserting conversations...");
    for (const conversation of conversations) {
        const params = {
            TableName: "conversations",
            Item: conversation,
        };

        try {
            await dynamodb.put(params).promise();
            console.log(`  ✅ Inserted: ${conversation.title}`);
        } catch (error) {
            console.error(`  ❌ Failed to insert conversation:`, error);
            throw error;
        }
    }
};

const seedConversationParticipants = async () => {
    const participants = [
        {
            conversation_id: "conv-123e4567-e89b-12d3-a456-426614174000",
            user_id: "user-001",
            unread_count: 0,
            last_read_message_id: "msg-987f6543-e21b-45d3-b789-426614174111",
            joined_at: "2026-04-12T09:15:20.000Z",
            created_at: "2026-04-12T09:15:20.000Z",
            is_active: true,
        },
        {
            conversation_id: "conv-123e4567-e89b-12d3-a456-426614174000",
            user_id: "user-002",
            unread_count: 2,
            last_read_message_id: "msg-887f6543-e21b-45d3-b789-426614174110",
            joined_at: "2026-04-12T09:20:15.000Z",
            created_at: "2026-04-12T09:20:15.000Z",
            is_active: true,
        },
        {
            conversation_id: "conv-123e4567-e89b-12d3-a456-426614174000",
            user_id: "admin-001",
            unread_count: 0,
            last_read_message_id: "msg-987f6543-e21b-45d3-b789-426614174111",
            joined_at: "2026-04-12T09:30:00.000Z",
            created_at: "2026-04-12T09:30:00.000Z",
            is_active: true,
        },
        {
            conversation_id: "conv-223e4567-e89b-12d3-a456-426614174001",
            user_id: "user-002",
            unread_count: 1,
            last_read_message_id: "msg-a87f6543-e21b-45d3-b789-426614174222",
            joined_at: "2026-04-12T08:00:00.000Z",
            created_at: "2026-04-12T08:00:00.000Z",
            is_active: true,
        },
        {
            conversation_id: "conv-223e4567-e89b-12d3-a456-426614174001",
            user_id: "user-003",
            unread_count: 0,
            last_read_message_id: "msg-a87f6543-e21b-45d3-b789-426614174222",
            joined_at: "2026-04-12T08:05:10.000Z",
            created_at: "2026-04-12T08:05:10.000Z",
            is_active: true,
        },
        {
            conversation_id: "conv-223e4567-e89b-12d3-a456-426614174001",
            user_id: "admin-002",
            unread_count: 0,
            last_read_message_id: "msg-a87f6543-e21b-45d3-b789-426614174222",
            joined_at: "2026-04-12T08:10:00.000Z",
            created_at: "2026-04-12T08:10:00.000Z",
            is_active: true,
        },
        {
            conversation_id: "conv-323e4567-e89b-12d3-a456-426614174002",
            user_id: "user-003",
            unread_count: 0,
            last_read_message_id: null,
            joined_at: "2026-04-12T11:00:00.000Z",
            created_at: "2026-04-12T11:00:00.000Z",
            is_active: true,
        },
        {
            conversation_id: "conv-323e4567-e89b-12d3-a456-426614174002",
            user_id: "admin-001",
            unread_count: 1,
            last_read_message_id: null,
            joined_at: "2026-04-12T11:00:05.000Z",
            created_at: "2026-04-12T11:00:05.000Z",
            is_active: true,
        },
    ];

    console.log("\n📝 Inserting conversation participants...");
    for (const participant of participants) {
        const params = {
            TableName: "conversation_participants",
            Item: participant,
        };

        try {
            await dynamodb.put(params).promise();
            console.log(
                `  ✅ Inserted: ${participant.user_id} to conversation ${participant.conversation_id.substring(5, 15)}...`,
            );
        } catch (error) {
            console.error(`  ❌ Failed to insert participant:`, error);
            throw error;
        }
    }
};

// Run if this file is executed directly
if (require.main === module) {
    seedData();
}

module.exports = seedData;
