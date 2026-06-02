const { Op } = require("sequelize");
const { v4: uuidv4 } = require("uuid");

const userModel = require("./models/userModel");
const { getPhoneDigits } = require("@core/helpers/phoneHelper");

const USER_SAFE_ATTRIBUTES = [
  "userId",
  "fullname",
  "gender",
  "dateOfBirth",
  "password",
  "username",
  "typeLogin",
  "email",
  "phoneNumber",
  "countryCode",
  "role",
  "avatarPath",
  "paymentMethodId",
  "lastLogin",
  "isOnline",
  "tokenVersion",
  "createdAt",
  "updatedAt",
];

/**
 * Converts a Sequelize user model instance into a plain JavaScript object.
 * Maps specific field names to ensure consistency across the application.
 * @param {Object} user - The user model instance or plain object.
 * @returns {Object|null} The normalized plain user object, or null if input is falsy.
 */
const toPlainUser = (user) => {
  if (!user) return null;
  const plainUser = typeof user.get === "function" ? user.get({ plain: true }) : user;
  return {
    ...plainUser,
    user_id: plainUser.user_id || plainUser.userId,
    avatar_path: plainUser.avatar_path || plainUser.avatarPath || null,
  };
};

/**
 * Retrieves a user by their phone number and country code.
 * @param {string} countryCode - The country code (e.g., '+84').
 * @param {string} phoneNumber - The user's phone number.
 * @returns {Promise<Object|null>} A Promise resolving to the plain user object, or null if not found.
 */
const getUserByPhoneNumber = async (countryCode, phoneNumber) => {
  const digits = getPhoneDigits(phoneNumber);
  const user = await userModel.findOne({
    attributes: USER_SAFE_ATTRIBUTES,
    where: { countryCode, phoneNumber: digits },
  });
  return toPlainUser(user);
};

/**
 * Retrieves a user by their email address.
 * @param {string} email - The user's email address.
 * @returns {Promise<Object|null>} A Promise resolving to the plain user object, or null if not found.
 */
const getUserByEmail = async (email) => {
  const user = await userModel.findOne({
    attributes: USER_SAFE_ATTRIBUTES,
    where: { email },
  });
  return toPlainUser(user);
};

/**
 * Retrieves a user by their unique ID and returns it as a plain object.
 * @param {string} userId - The unique identifier of the user.
 * @param {Object} [options={}] - Optional Sequelize query options.
 * @returns {Promise<Object|null>} A Promise resolving to the plain user object, or null if not found.
 */
const getUserById = async (userId, options = {}) => {
  const user = await userModel.findOne({
    ...options,
    where: { userId },
  });
  return toPlainUser(user);
};

/**
 * Retrieves a user record by its primary key (without converting to plain object).
 * @param {string} userId - The unique identifier of the user.
 * @param {Object} [options={}] - Optional Sequelize query options.
 * @returns {Promise<Object|null>} A Promise resolving to the Sequelize user model instance.
 */
const getUserRecordById = async (userId, options = {}) => {
  return userModel.findByPk(userId, options);
};

/**
 * Finds a single user record based on arbitrary conditions.
 * @param {Object} where - The Sequelize where clause.
 * @param {Object} [options={}] - Additional Sequelize query options.
 * @returns {Promise<Object|null>} A Promise resolving to the Sequelize user model instance.
 */
const findUserRecord = async (where, options = {}) => {
  return userModel.findOne({
    ...options,
    where,
  });
};

/**
 * Updates a user's data by their unique ID.
 * @param {string} userId - The unique identifier of the user.
 * @param {Object} updateData - The data fields to update.
 * @param {Object} [options={}] - Optional Sequelize update options.
 * @returns {Promise<Object|null>} A Promise resolving to the updated Sequelize model instance, or null.
 */
const updateUserById = async (userId, updateData, options = {}) => {
  const user = await userModel.findByPk(userId, options);
  if (!user) return null;
  await user.update(updateData, options);
  return user;
};

/**
 * Creates a new user record in the database.
 * @param {Object} data - The user data to insert.
 * @param {Object} [options={}] - Optional Sequelize query options.
 * @returns {Promise<Object>} A Promise resolving to the newly created Sequelize user model instance.
 */
const createUserRecord = async (data, options = {}) => {
  return userModel.create(data, options);
};

/**
 * Counts the total number of users matching specific options.
 * @param {Object} [options={}] - Optional Sequelize query options.
 * @returns {Promise<number>} A Promise resolving to the count of users.
 */
const countUsers = async (options = {}) => {
  return userModel.count(options);
};

/**
 * Finds and counts users for pagination purposes.
 * @param {Object} [options={}] - Optional Sequelize query options including offset and limit.
 * @returns {Promise<{rows: Array, count: number}>} A Promise resolving to the paginated results and total count.
 */
const findAndCountUsers = async (options = {}) => {
  return userModel.findAndCountAll(options);
};

/**
 * Creates a new user specifically from the registration flow.
 * @param {string} username - The user's chosen username.
 * @param {string} typeLogin - The method used for login (e.g., 'local', 'google').
 * @param {string} countryCode - The country code for phone number.
 * @param {string} phoneNumber - The user's phone number.
 * @param {string} password - The user's hashed password.
 * @returns {Promise<Object>} A Promise resolving to the created Sequelize user model instance.
 */
const createUser = async (
  username,
  typeLogin,
  countryCode,
  phoneNumber,
  password,
) => {
  const digits = getPhoneDigits(phoneNumber);
  return userModel.create({
    userId: uuidv4(),
    username,
    typeLogin,
    phoneNumber: digits,
    countryCode,
    password,
  });
};

/**
 * Searches for users using a general query string matching email, phone, fullname, or username.
 * @param {string} query - The search string.
 * @returns {Promise<Array>} A Promise resolving to an array of matching plain user objects.
 */
const findUser = async (query) => {
  if (!query) return [];

  let normalizedPhone = query;
  if (!query.includes("@") && query.replace(/\D/g, "").length >= 9) {
    normalizedPhone = getPhoneDigits(query);
  }

  const users = await userModel.findAll({
    attributes: USER_SAFE_ATTRIBUTES,
    where: {
      [Op.or]: [
        { email: { [Op.like]: `%${query}%` } },
        { phoneNumber: { [Op.like]: `%${normalizedPhone}%` } },
        { fullname: { [Op.like]: `%${query}%` } },
        { username: { [Op.like]: `%${query}%` } },
      ],
    },
    limit: 20,
  });

  return users.map(toPlainUser);
};

module.exports = {
  USER_SAFE_ATTRIBUTES,
  countUsers,
  createUser,
  createUserRecord,
  findUser,
  findAndCountUsers,
  findUserRecord,
  getUserRecordById,
  getUserByEmail,
  getUserById,
  getUserByPhoneNumber,
  toPlainUser,
  updateUserById,
};
