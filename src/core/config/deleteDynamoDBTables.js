require("dotenv").config();
const AWS = require("aws-sdk");

// Configure AWS
AWS.config.update({
    region: process.env.AWS_REGION || "ap-southeast-1",
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

const dynamodb = new AWS.DynamoDB();

const deleteTables = async () => {
    try {
        console.log("Deleting DynamoDB tables...");

        const tableNames = ["conversations", "conversation_participants", "messages"];

        for (const tableName of tableNames) {
            try {
                console.log(`Deleting table: ${tableName}...`);
                await dynamodb.deleteTable({ TableName: tableName }).promise();
                console.log(`✅ Table ${tableName} deletion initiated`);

                // Wait for table to be deleted
                await dynamodb
                    .waitFor("tableNotExists", { TableName: tableName })
                    .promise();
                console.log(`✅ Table ${tableName} deleted successfully`);
            } catch (error) {
                if (error.code === "ResourceNotFoundException") {
                    console.log(`⚠️  Table ${tableName} does not exist`);
                } else {
                    throw error;
                }
            }
        }

        console.log("\n✅ All DynamoDB tables deleted!");
        console.log("\nNow run: npm run setup:dynamodb");
        process.exit(0);
    } catch (error) {
        console.error("❌ Error deleting DynamoDB tables:", error);
        process.exit(1);
    }
};

// Run if this file is executed directly
if (require.main === module) {
    deleteTables();
}

module.exports = deleteTables;
