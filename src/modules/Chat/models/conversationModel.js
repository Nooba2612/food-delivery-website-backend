const { v4: uuidv4 } = require("uuid");
const dynamodb = require("@core/config/dynamodb");

const TABLE_NAME = "conversations";

class ConversationModel {
  static async create(conversationData) {
    const conversation_id = uuidv4();
    const now = new Date().toISOString();

    const params = {
      TableName: TABLE_NAME,
      Item: {
        conversation_id,
        ...conversationData,
        created_at: now,
        updated_at: now,
        is_active: true,
      },
    };

    await dynamodb.put(params).promise();
    return params.Item;
  }

  static async findById(conversationId) {
    if (!conversationId) return null;

    const params = {
      TableName: TABLE_NAME,
      Key: { conversation_id: conversationId },
    };

    const result = await dynamodb.get(params).promise();
    if (!result.Item) return null;

    // Task 5: Ensure both conversation_id and id are available for frontend compatibility
    return {
      ...result.Item,
      id: result.Item.conversation_id,
    };
  }

  static async findByIdAndUserId(conversationId, userId) {
    const conversation = await this.findById(conversationId);
    if (!conversation) return null;

    // Check if user is participant
    const ConversationParticipantModel = require("./conversationParticipantModel");
    const isParticipant = await ConversationParticipantModel.isMember(
      conversationId,
      userId,
    );

    if (!isParticipant) return null;
    return conversation;
  }

  static async update(conversationId, updateData) {
    const now = new Date().toISOString();
    const updateFields = Object.keys(updateData)
      .map((key) => `#${key} = :${key}`)
      .join(", ");

    const expressionAttributeNames = Object.keys(updateData).reduce(
      (acc, key) => {
        acc[`#${key}`] = key;
        return acc;
      },
      { "#updated_at": "updated_at" },
    );

    const expressionAttributeValues = Object.keys(updateData).reduce(
      (acc, key) => {
        acc[`:${key}`] = updateData[key];
        return acc;
      },
      { ":updated_at": now },
    );

    const params = {
      TableName: TABLE_NAME,
      Key: { conversation_id: conversationId },
      UpdateExpression: `SET ${updateFields}, #updated_at = :updated_at`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: "ALL_NEW",
    };

    const result = await dynamodb.update(params).promise();
    return result.Attributes;
  }

  static async updateLastMessage(conversationId, messageId, timestamp) {
    return this.update(conversationId, {
      last_message_id: messageId,
      last_message_timestamp: timestamp,
    });
  }

  static async delete(conversationId) {
    const params = {
      TableName: TABLE_NAME,
      Key: { conversation_id: conversationId },
      UpdateExpression: "SET is_active = :is_active, updated_at = :updated_at",
      ExpressionAttributeValues: {
        ":is_active": false,
        ":updated_at": new Date().toISOString(),
      },
    };

    await dynamodb.update(params).promise();
  }
}

module.exports = ConversationModel;
