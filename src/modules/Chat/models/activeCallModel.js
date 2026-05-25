const { v4: uuidv4 } = require("uuid");
const dynamodb = require("@core/config/dynamodb");

const TABLE_NAME = "active_calls";

class ActiveCallModel {
  static async create(callData) {
    const active_call_id = uuidv4();
    const now = new Date().toISOString();

    const params = {
      TableName: TABLE_NAME,
      Item: {
        active_call_id,
        ...callData,
        call_started_at: now,
        created_at: now,
      },
    };

    await dynamodb.put(params).promise();
    return params.Item;
  }

  static async findById(activeCallId) {
    const params = {
      TableName: TABLE_NAME,
      Key: { active_call_id: activeCallId },
    };

    const result = await dynamodb.get(params).promise();
    return result.Item || null;
  }

  /**
   * Find active call by call_id
   */
  static async findByCallId(callId) {
    const params = {
      TableName: TABLE_NAME,
      IndexName: "call_id-index",
      KeyConditionExpression: "call_id = :callId",
      ExpressionAttributeValues: {
        ":callId": callId,
      },
    };

    const result = await dynamodb.query(params).promise();
    return result.Items?.[0] || null;
  }

  static async update(activeCallId, updateData) {
    const updateFields = Object.keys(updateData)
      .map((key) => `${key} = :${key}`)
      .join(", ");

    const expressionAttributeValues = Object.keys(updateData).reduce(
      (acc, key) => {
        acc[`:${key}`] = updateData[key];
        return acc;
      },
      {},
    );

    const params = {
      TableName: TABLE_NAME,
      Key: { active_call_id: activeCallId },
      UpdateExpression: `SET ${updateFields}`,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: "ALL_NEW",
    };

    const result = await dynamodb.update(params).promise();
    return result.Attributes;
  }

  static async delete(activeCallId) {
    const params = {
      TableName: TABLE_NAME,
      Key: { active_call_id: activeCallId },
    };

    await dynamodb.delete(params).promise();
    return { success: true };
  }

  /**
   * Get all active calls
   */
  static async getAllActiveCalls() {
    const params = {
      TableName: TABLE_NAME,
      Limit: 100,
    };

    const result = await dynamodb.scan(params).promise();
    return result.Items || [];
  }
}

module.exports = ActiveCallModel;
