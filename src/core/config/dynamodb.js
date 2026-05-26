const AWS = require("aws-sdk");

const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const region = process.env.AWS_REGION || "ap-southeast-1";

let dynamodb;

if (accessKeyId && secretAccessKey && !accessKeyId.includes("dummy") && !secretAccessKey.includes("dummy")) {
    AWS.config.update({
        region: region,
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey,
    });

    dynamodb = new AWS.DynamoDB.DocumentClient({
        convertEmptyValues: true,
        service: new AWS.DynamoDB(),
    });
} else {
    console.warn("AWS DynamoDB credentials missing or invalid. DynamoDB operations will fail.");
    // Mock or minimal object to prevent immediate crashes if required
    dynamodb = {
        get: () => ({ promise: () => Promise.reject(new Error("DynamoDB not configured")) }),
        put: () => ({ promise: () => Promise.reject(new Error("DynamoDB not configured")) }),
        query: () => ({ promise: () => Promise.reject(new Error("DynamoDB not configured")) }),
        update: () => ({ promise: () => Promise.reject(new Error("DynamoDB not configured")) }),
        delete: () => ({ promise: () => Promise.reject(new Error("DynamoDB not configured")) }),
    };
}

module.exports = dynamodb;

