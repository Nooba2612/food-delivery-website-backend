const bcrypt = require("bcryptjs");

const authUserService = require("@modules/Auth/user.service");
const addressModel = require("./models/addressModel");

/**
 * Retrieves a user by their phone number and country code.
 * Proxies the request to the central Auth User Service.
 * @param {string} countryCode - The country code.
 * @param {string} phoneNumber - The user's phone number.
 * @returns {Promise<Object|null>} A Promise resolving to the user object, or null.
 */
const getUserByPhoneNumber = async (countryCode, phoneNumber) => {
  return authUserService.getUserByPhoneNumber(countryCode, phoneNumber);
};

/**
 * Retrieves a user by their email address.
 * Proxies the request to the central Auth User Service.
 * @param {string} email - The user's email address.
 * @returns {Promise<Object|null>} A Promise resolving to the user object, or null.
 */
const getUserByEmail = async (email) => {
  return authUserService.getUserByEmail(email);
};

/**
 * Retrieves the full profile of a user, including their saved addresses.
 * Excludes sensitive information like passwords.
 * @param {string} userId - The unique identifier of the user.
 * @returns {Promise<Object>} A Promise resolving to the complete user profile object.
 * @throws {Error} If the user is not found.
 */
const getProfile = async (userId) => {
  try {
    const user = await authUserService.getUserById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    const addresses = await addressModel.findAll({
      where: { userId },
      attributes: { exclude: ["userId"] },
      order: [
        ["is_default", "DESC"],
        ["created_at", "DESC"],
      ],
    });

    return {
      ...user,
      password: undefined,
      addresses: addresses.map((address) => address.toJSON()),
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Retrieves a user by their unique ID.
 * Proxies the request to the central Auth User Service.
 * @param {string} userId - The unique identifier of the user.
 * @returns {Promise<Object|null>} A Promise resolving to the user object, or null.
 */
const getUserById = async (userId) => {
  return authUserService.getUserById(userId);
};

/**
 * Creates a new user in the system.
 * Proxies the request to the central Auth User Service.
 * @param {string} username - The chosen username.
 * @param {string} type_login - The login type (e.g., local, google).
 * @param {string} country_code - The country code.
 * @param {string} phone_number - The user's phone number.
 * @param {string} password - The user's password (hashed).
 * @returns {Promise<Object>} A Promise resolving to the created user object.
 */
const createUser = async (
  username,
  type_login,
  country_code,
  phone_number,
  password,
) => {
  try {
    return authUserService.createUser(
      username,
      type_login,
      country_code,
      phone_number,
      password,
    );
  } catch (error) {
    throw error;
  }
};

/**
 * Updates a user's profile information.
 * Validates the input data to ensure security and data integrity.
 * @param {string} userId - The unique identifier of the user.
 * @param {Object} updateData - The fields to update (fullname, username, gender, dateOfBirth, avatarPath).
 * @returns {Promise<Object>} A Promise resolving to the updated user profile.
 * @throws {Error} If validation fails or the user is not found.
 */
const updateProfile = async (userId, updateData) => {
  try {
    const user = await authUserService.getUserById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    const allowedFields = [
      "fullname",
      "username",
      "gender",
      "dateOfBirth",
      "avatarPath",
    ];
    const updateObj = {};

    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        let val = updateData[field];
        if (typeof val === "string") {
          val = val.trim().replace(/\s+/g, " ");
        }
        if (val !== "" || field === "avatarPath") {
          updateObj[field] = val;
        }
      }
    }

    if (
      updateObj.fullname &&
      (updateObj.fullname.length < 2 || updateObj.fullname.length > 255)
    ) {
      throw new Error("Full name must be between 2 and 255 characters");
    }
    if (
      updateObj.username &&
      (updateObj.username.length < 3 || updateObj.username.length > 50)
    ) {
      throw new Error("Username must be between 3 and 50 characters");
    }

    if (updateObj.username && updateObj.username !== user.username) {
      const existingUser = await authUserService.findUserRecord({
        username: updateObj.username,
      });
      if (existingUser) {
        throw new Error("Username already taken");
      }
    }

    await authUserService.updateUserById(userId, updateObj);

    return await getProfile(userId);
  } catch (error) {
    throw error;
  }
};

/**
 * Changes a user's password.
 * Verifies the old password before updating to the new one.
 * @param {string} userId - The unique identifier of the user.
 * @param {string} oldPassword - The user's current password.
 * @param {string} newPassword - The user's new password.
 * @returns {Promise<Object>} A Promise resolving to a success message.
 * @throws {Error} If the old password is incorrect or the user is not found.
 */
const changePassword = async (userId, oldPassword, newPassword) => {
  try {
    const user = await authUserService.getUserById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      throw new Error("Old password incorrect");
    }

    const newPasswordHashed = await bcrypt.hash(newPassword, 10);

    await authUserService.updateUserById(userId, {
      password: newPasswordHashed,
    });

    return { message: "Password changed successfully" };
  } catch (error) {
    throw error;
  }
};

/**
 * Searches for users based on a general query string.
 * @param {string} query - The search query (email, phone, etc.).
 * @returns {Promise<Array>} A Promise resolving to an array of matching users.
 */
const findUser = async (query) => {
  return authUserService.findUser(query);
};

module.exports = {
  getUserByPhoneNumber,
  getUserById,
  getProfile,
  updateProfile,
  createUser,
  getUserByEmail,
  changePassword,
  findUser,
};
