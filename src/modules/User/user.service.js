const bcrypt = require("bcryptjs");

const authUserService = require("@modules/Auth/user.service");
const addressModel = require("./models/addressModel");

const getUserByPhoneNumber = async (countryCode, phoneNumber) => {
  return authUserService.getUserByPhoneNumber(countryCode, phoneNumber);
};

const getUserByEmail = async (email) => {
  return authUserService.getUserByEmail(email);
};

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

const getUserById = async (userId) => {
  return authUserService.getUserById(userId);
};

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

const updateProfile = async (userId, updateData) => {
  try {
    const user = await authUserService.getUserById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    // 1. Define allowed fields (Strict)
    const allowedFields = [
      "fullname",
      "username",
      "gender",
      "dateOfBirth",
      "avatarPath",
    ];
    const updateObj = {};

    // 2. Filter, Normalize (trim + collapse spaces)
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

    // 3. Validation
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

    // 4. Username Uniqueness Check
    if (updateObj.username && updateObj.username !== user.username) {
      const existingUser = await authUserService.findUserRecord({
        username: updateObj.username,
      });
      if (existingUser) {
        throw new Error("Username already taken");
      }
    }

    // 5. Update using best practice
    await authUserService.updateUserById(userId, updateObj);

    // 6. Return fresh data
    return await getProfile(userId);
  } catch (error) {
    throw error;
  }
};

const changePassword = async (userId, oldPassword, newPassword) => {
  try {
    const user = await authUserService.getUserById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    // Verify old password
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
