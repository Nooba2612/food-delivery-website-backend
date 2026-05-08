const AWS = require("aws-sdk");
require("dotenv").config();

const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const region = process.env.AWS_REGION || "ap-southeast-1";

AWS.config.update({
    region: region,
    accessKeyId: accessKeyId,
    secretAccessKey: secretAccessKey,
});

const dynamodb = new AWS.DynamoDB.DocumentClient();

async function checkConversation(id) {
    const params = {
        TableName: "conversations",
        Key: { conversation_id: id }
    };
    try {
        const result = await dynamodb.get(params).promise();
        console.log("Result for ID", id, ":", JSON.stringify(result, null, 2));
        
        if (!result.Item) {
            console.log("ID not found by Key. Scanning...");
            const scanParams = {
                TableName: "conversations",
                FilterExpression: "conversation_id = :id OR id = :id",
                ExpressionAttributeValues: { ":id": id }
            };
            const scanResult = await dynamodb.scan(scanParams).promise();
            console.log("Scan Result:", JSON.stringify(scanResult, null, 2));
        }
    } catch (error) {
        console.error("Error checking conversation:", error);
    }
}

const targetId = process.argv[2] || "20e1b6d2-2982-431c-95e5-315aaff98450";
checkConversation(targetId);
