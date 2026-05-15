require("dotenv").config();
const AWS = require("aws-sdk");

// Configure AWS
AWS.config.update({
    region: process.env.AWS_REGION || "ap-southeast-1",
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

const dynamodb = new AWS.DynamoDB();

const createTables = async () => {
    try {
        console.log("🔧 Initializing DynamoDB tables...\n");

        // Create conversations table
        await createConversationsTable();

        // Create conversation_participants table
        await createConversationParticipantsTable();

        // Create messages table
        await createMessagesTable();

        // Create calls table
        await createCallsTable();

        // Create active_calls table
        await createActiveCallsTable();

        // Update existing tables to add missing indexes
        console.log("\n🔄 Updating tables with missing indexes...");
        await updateMissingIndexes();

        console.log("\n✅ All DynamoDB tables created successfully!");
        process.exit(0);
    } catch (error) {
        console.error("❌ Error initializing DynamoDB tables:", error);
        process.exit(1);
    }
};

const createConversationsTable = async () => {
    const params = {
        TableName: "conversations",
        KeySchema: [{ AttributeName: "conversation_id", KeyType: "HASH" }],
        AttributeDefinitions: [{ AttributeName: "conversation_id", AttributeType: "S" }],
        BillingMode: "PAY_PER_REQUEST",
    };

    try {
        console.log("📝 Creating conversations table...");
        await dynamodb.createTable(params).promise();

        // Wait for table to be created
        await dynamodb.waitFor("tableExists", { TableName: "conversations" }).promise();
        console.log("✅ conversations table created successfully");
    } catch (error) {
        if (error.code === "ResourceInUseException") {
            console.log("⚠️  conversations table already exists");
        } else {
            throw error;
        }
    }
};

const createConversationParticipantsTable = async () => {
    const params = {
        TableName: "conversation_participants",
        KeySchema: [
            { AttributeName: "conversation_id", KeyType: "HASH" },
            { AttributeName: "user_id", KeyType: "RANGE" },
        ],
        AttributeDefinitions: [
            { AttributeName: "conversation_id", AttributeType: "S" },
            { AttributeName: "user_id", AttributeType: "S" },
        ],
        GlobalSecondaryIndexes: [
            {
                IndexName: "user_id-conversation_id-index",
                KeySchema: [
                    { AttributeName: "user_id", KeyType: "HASH" },
                    { AttributeName: "conversation_id", KeyType: "RANGE" },
                ],
                Projection: { ProjectionType: "ALL" },
            },
        ],
        BillingMode: "PAY_PER_REQUEST",
    };

    try {
        console.log("📝 Creating conversation_participants table...");
        await dynamodb.createTable(params).promise();

        // Wait for table to be created
        await dynamodb.waitFor("tableExists", { TableName: "conversation_participants" }).promise();
        console.log("✅ conversation_participants table created successfully");
    } catch (error) {
        if (error.code === "ResourceInUseException") {
            console.log("⚠️  conversation_participants table already exists");
        } else {
            throw error;
        }
    }
};

const createMessagesTable = async () => {
    const params = {
        TableName: "messages",
        KeySchema: [
            { AttributeName: "conversation_id", KeyType: "HASH" },
            { AttributeName: "message_id", KeyType: "RANGE" },
        ],
        AttributeDefinitions: [
            { AttributeName: "conversation_id", AttributeType: "S" },
            { AttributeName: "message_id", AttributeType: "S" },
            { AttributeName: "created_at", AttributeType: "S" },
        ],
        GlobalSecondaryIndexes: [
            {
                IndexName: "conversation_id-created_at-index",
                KeySchema: [
                    { AttributeName: "conversation_id", KeyType: "HASH" },
                    { AttributeName: "created_at", KeyType: "RANGE" },
                ],
                Projection: { ProjectionType: "ALL" },
            },
        ],
        BillingMode: "PAY_PER_REQUEST",
    };

    try {
        console.log("📝 Creating messages table...");
        await dynamodb.createTable(params).promise();

        // Wait for table to be created
        await dynamodb.waitFor("tableExists", { TableName: "messages" }).promise();
        console.log("✅ messages table created successfully");
    } catch (error) {
        if (error.code === "ResourceInUseException") {
            console.log("⚠️  messages table already exists");
        } else {
            throw error;
        }
    }
};

const createCallsTable = async () => {
    const params = {
        TableName: "calls",
        KeySchema: [{ AttributeName: "call_id", KeyType: "HASH" }],
        AttributeDefinitions: [
            { AttributeName: "call_id", AttributeType: "S" },
            { AttributeName: "conversation_id", AttributeType: "S" },
            { AttributeName: "initiator_id", AttributeType: "S" },
            { AttributeName: "created_at", AttributeType: "N" },
            { AttributeName: "status", AttributeType: "S" },
        ],
        GlobalSecondaryIndexes: [
            {
                IndexName: "conversation_id-created_at-index",
                KeySchema: [
                    { AttributeName: "conversation_id", KeyType: "HASH" },
                    { AttributeName: "created_at", KeyType: "RANGE" },
                ],
                Projection: { ProjectionType: "ALL" },
            },
            {
                IndexName: "initiator_id-status-index",
                KeySchema: [
                    { AttributeName: "initiator_id", KeyType: "HASH" },
                    { AttributeName: "status", KeyType: "RANGE" },
                ],
                Projection: { ProjectionType: "ALL" },
            },
        ],
        BillingMode: "PAY_PER_REQUEST",
    };

    try {
        console.log("📝 Creating calls table...");
        await dynamodb.createTable(params).promise();

        // Wait for table to be created
        await dynamodb.waitFor("tableExists", { TableName: "calls" }).promise();
        console.log("✅ calls table created successfully");
    } catch (error) {
        if (error.code === "ResourceInUseException") {
            console.log("⚠️  calls table already exists");
        } else {
            throw error;
        }
    }
};

const createActiveCallsTable = async () => {
    const params = {
        TableName: "active_calls",
        KeySchema: [{ AttributeName: "active_call_id", KeyType: "HASH" }],
        AttributeDefinitions: [
            { AttributeName: "active_call_id", AttributeType: "S" },
            { AttributeName: "call_id", AttributeType: "S" },
        ],
        GlobalSecondaryIndexes: [
            {
                IndexName: "call_id-index",
                KeySchema: [{ AttributeName: "call_id", KeyType: "HASH" }],
                Projection: { ProjectionType: "ALL" },
            },
        ],
        BillingMode: "PAY_PER_REQUEST",
    };

    try {
        console.log("📝 Creating active_calls table...");
        await dynamodb.createTable(params).promise();

        // Wait for table to be created
        await dynamodb.waitFor("tableExists", { TableName: "active_calls" }).promise();
        console.log("✅ active_calls table created successfully");
    } catch (error) {
        if (error.code === "ResourceInUseException") {
            console.log("⚠️  active_calls table already exists");
        } else {
            throw error;
        }
    }
};

const updateMissingIndexes = async () => {
    // Update messages table to add missing conversation_id-created_at-index
    await addIndexToMessagesTable();

    // Update calls table to ensure all indexes exist
    await addIndexToCallsTable();
};

const addIndexToMessagesTable = async () => {
    try {
        const tableDescription = await dynamodb.describeTable({ TableName: "messages" }).promise();
        const gsiNames = (tableDescription.Table.GlobalSecondaryIndexes || []).map((gsi) => gsi.IndexName);

        if (!gsiNames.includes("conversation_id-created_at-index")) {
            console.log("📝 Adding conversation_id-created_at-index to messages table...");

            const params = {
                TableName: "messages",
                AttributeDefinitions: [{ AttributeName: "created_at", AttributeType: "S" }],
                GlobalSecondaryIndexUpdates: [
                    {
                        Create: {
                            IndexName: "conversation_id-created_at-index",
                            KeySchema: [
                                { AttributeName: "conversation_id", KeyType: "HASH" },
                                { AttributeName: "created_at", KeyType: "RANGE" },
                            ],
                            Projection: { ProjectionType: "ALL" },
                        },
                    },
                ],
            };

            await dynamodb.updateTable(params).promise();
            await dynamodb.waitFor("tableExists", { TableName: "messages" }).promise();
            console.log("✅ conversation_id-created_at-index added to messages table");
        } else {
            console.log("✓ conversation_id-created_at-index already exists in messages table");
        }
    } catch (error) {
        if (error.code === "ResourceNotFoundException") {
            console.log("ℹ️  messages table doesn't exist yet (will be created)");
        } else {
            console.error("⚠️  Could not update messages table:", error.message);
        }
    }
};

const addIndexToCallsTable = async () => {
    try {
        const tableDescription = await dynamodb.describeTable({ TableName: "calls" }).promise();
        const gsiNames = (tableDescription.Table.GlobalSecondaryIndexes || []).map((gsi) => gsi.IndexName);

        if (!gsiNames.includes("conversation_id-created_at-index")) {
            console.log("📝 Adding conversation_id-created_at-index to calls table...");

            const params = {
                TableName: "calls",
                AttributeDefinitions: [{ AttributeName: "created_at", AttributeType: "N" }],
                GlobalSecondaryIndexUpdates: [
                    {
                        Create: {
                            IndexName: "conversation_id-created_at-index",
                            KeySchema: [
                                { AttributeName: "conversation_id", KeyType: "HASH" },
                                { AttributeName: "created_at", KeyType: "RANGE" },
                            ],
                            Projection: { ProjectionType: "ALL" },
                        },
                    },
                ],
            };

            await dynamodb.updateTable(params).promise();
            await dynamodb.waitFor("tableExists", { TableName: "calls" }).promise();
            console.log("✅ conversation_id-created_at-index added to calls table");
        } else {
            console.log("✓ conversation_id-created_at-index already exists in calls table");
        }
    } catch (error) {
        if (error.code === "ResourceNotFoundException") {
            console.log("ℹ️  calls table doesn't exist yet (will be created)");
        } else {
            console.error("⚠️  Could not update calls table:", error.message);
        }
    }
};

// Run if this file is executed directly
if (require.main === module) {
    createTables();
}

module.exports = createTables;
