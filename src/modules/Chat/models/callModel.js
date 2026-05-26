const { v4: uuidv4 } = require("uuid");
const dynamodb = require("@core/config/dynamodb");

const TABLE_NAME = "calls";

class CallModel {
  static async create(callData) {
    const call_id = uuidv4();
    const now = new Date().toISOString();

    const params = {
      TableName: TABLE_NAME,
      Item: {
        call_id,
        ...callData,
        status: "ringing", // ringing, accepted, rejected, ended, missed
        created_at: now,
        updated_at: now,
      },
    };

    // For group calls
    if (callData.is_group_call) {
      params.Item.is_group_call = true;
      params.Item.participant_ids = callData.participant_ids || [];
      params.Item.active_participant_ids =
        callData.active_participant_ids || [];
    }

    await dynamodb.put(params).promise();
    return params.Item;
  }

  static async findById(callId) {
    const params = {
      TableName: TABLE_NAME,
      Key: { call_id: callId },
    };

    const result = await dynamodb.get(params).promise();
    return result.Item || null;
  }

  static async update(callId, updateData) {
    const now = new Date().toISOString();
    const updateFields = Object.keys(updateData)
      .map((key) => `#${key} = :${key}`)
      .join(", ");

    const expressionAttributeValues = Object.keys(updateData).reduce(
      (acc, key) => {
        acc[`:${key}`] = updateData[key];
        return acc;
      },
      { ":updated_at": now },
    );

    const expressionAttributeNames = Object.keys(updateData).reduce(
      (acc, key) => {
        acc[`#${key}`] = key;
        return acc;
      },
      { "#updated_at": "updated_at" },
    );

    const params = {
      TableName: TABLE_NAME,
      Key: { call_id: callId },
      UpdateExpression: `SET ${updateFields}, #updated_at = :updated_at`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: "ALL_NEW",
    };

    const result = await dynamodb.update(params).promise();
    return result.Attributes;
  }

  /**
   * Get call history for a conversation
   */
  static async getHistory(conversationId, limit = 50, cursor = null) {
    const params = {
      TableName: TABLE_NAME,
      IndexName: "conversation_id-created_at-index",
      KeyConditionExpression: "conversation_id = :conversationId",
      ExpressionAttributeValues: {
        ":conversationId": conversationId,
      },
      Limit: limit,
      ScanIndexForward: false, // Newest first
      ExclusiveStartKey: cursor,
    };

    const result = await dynamodb.query(params).promise();
    return {
      calls: result.Items || [],
      lastKey: result.LastEvaluatedKey,
    };
  }

  /**
   * Get active calls for user
   */
  static async getActiveCallsForUser(userId) {
    const params = {
      TableName: TABLE_NAME,
      IndexName: "initiator_id-status-index",
      KeyConditionExpression:
        "initiator_id = :userId AND #status IN (:ringing, :accepted)",
      ExpressionAttributeNames: {
        "#status": "status",
      },
      ExpressionAttributeValues: {
        ":userId": userId,
        ":ringing": "ringing",
        ":accepted": "accepted",
      },
    };

    const result = await dynamodb.query(params).promise();
    return result.Items || [];
  }

  /**
   * End call and calculate duration
   */
  static async endCall(callId) {
    const call = await this.findById(callId);
    if (!call) return null;

    const duration = call.started_at
      ? Math.floor((new Date() - new Date(call.started_at)) / 1000)
      : 0;

    return this.update(callId, {
      status: "ended",
      ended_at: new Date().toISOString(),
      duration_seconds: duration,
    });
  }
}

module.exports = CallModel;
