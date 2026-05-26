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
  "createdAt",
  "updatedAt",
];

const toPlainUser = (user) => {
  if (!user) return null;
  const plainUser = typeof user.get === "function" ? user.get({ plain: true }) : user;
  return {
    ...plainUser,
    user_id: plainUser.user_id || plainUser.userId,
    avatar_path: plainUser.avatar_path || plainUser.avatarPath || null,
  };
};

const getUserByPhoneNumber = async (countryCode, phoneNumber) => {
  const digits = getPhoneDigits(phoneNumber);
  const user = await userModel.findOne({
    attributes: USER_SAFE_ATTRIBUTES,
    where: { countryCode, phoneNumber: digits },
  });
  return toPlainUser(user);
};

const getUserByEmail = async (email) => {
  const user = await userModel.findOne({
    attributes: USER_SAFE_ATTRIBUTES,
    where: { email },
  });
  return toPlainUser(user);
};

const getUserById = async (userId, options = {}) => {
  const user = await userModel.findOne({
    ...options,
    where: { userId },
  });
  return toPlainUser(user);
};

const getUserRecordById = async (userId, options = {}) => {
  return userModel.findByPk(userId, options);
};

const findUserRecord = async (where, options = {}) => {
  return userModel.findOne({
    ...options,
    where,
  });
};

const updateUserById = async (userId, updateData, options = {}) => {
  const user = await userModel.findByPk(userId, options);
  if (!user) return null;
  await user.update(updateData, options);
  return user;
};

const createUserRecord = async (data, options = {}) => {
  return userModel.create(data, options);
};

const countUsers = async (options = {}) => {
  return userModel.count(options);
};

const findAndCountUsers = async (options = {}) => {
  return userModel.findAndCountAll(options);
};

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
