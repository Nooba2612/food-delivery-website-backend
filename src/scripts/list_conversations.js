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

async function listAll() {
    const params = { TableName: "conversations" };
    try {
        const result = await dynamodb.scan(params).promise();
        console.log("All Conversations:", JSON.stringify(result.Items, null, 2));
    } catch (error) {
        console.error("Error scanning conversations:", error);
    }
}

listAll();
