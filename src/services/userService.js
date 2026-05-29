const bcrypt = require("bcryptjs");
const { Op } = require("sequelize");

const { addressModel, userModel } = require("@models");

const USER_SAFE_ATTRIBUTES = [
    "userId",
    "fullname",
    "gender",
    "dateOfBirth",
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

const { normalizePhone, getPhoneDigits } = require("@helpers/phoneHelper");

const getUserByPhoneNumber = async (countryCode, phoneNumber) => {
    try {
        const digits = getPhoneDigits(phoneNumber);
        const user = await userModel.findOne({
            attributes: USER_SAFE_ATTRIBUTES,
            where: { countryCode: countryCode, phoneNumber: digits },
        });
        if (!user) return null;
        const plainUser = user.get({ plain: true });
        plainUser.user_id = plainUser.userId;
        return plainUser;
    } catch (error) {
        console.error("📌 [getUserByPhoneNumber] DB error:", error.message);
        throw error;
    }
};

const getUserByEmail = async (email) => {
    try {
        const user = await userModel.findOne({
            attributes: USER_SAFE_ATTRIBUTES,
            where: { email: email },
        });
        if (!user) return null;
        const plainUser = user.get({ plain: true });
        plainUser.user_id = plainUser.userId;
        return plainUser;
    } catch (error) {
        console.error("📌 [getUserByEmail] DB error:", error.message);
        throw error;
    }
};

const getProfile = async (userId) => {
    try {
        const user = await userModel.findByPk(userId, {
            attributes: USER_SAFE_ATTRIBUTES,
            include: [
                {
                    model: addressModel,
                    as: "addresses",
                    attributes: { exclude: ["userId"] },
                },
            ],
        });
        if (!user) {
            throw new Error("User not found");
        }
        return user.toJSON();
    } catch (error) {
        throw error;
    }
};

const getUserById = async (userId) => {
    try {
        const user = await userModel.findOne({ where: { userId: userId } });
        if (!user) return null;
        
        const plainUser = user.get({ plain: true });
        plainUser.user_id = plainUser.userId; // Ensure user_id is present
        return plainUser;
    } catch (error) {
        throw error;
    }
};

const createUser = async (username, type_login, country_code, phone_number, password) => {
    try {
        const digits = getPhoneDigits(phone_number);
        const newUser = await userModel.create({
            username,
            typeLogin: type_login,
            phoneNumber: digits,
            countryCode: country_code,
            password,
        });
        return newUser;
    } catch (error) {
        throw error;
    }
};

const updateProfile = async (userId, updateData) => {
    try {
        const user = await userModel.findByPk(userId);
        if (!user) {
            throw new Error("User not found");
        }

        // 1. Define allowed fields (Strict)
        const allowedFields = ["fullname", "username", "gender", "dateOfBirth", "avatarPath"];
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
        if (updateObj.fullname && (updateObj.fullname.length < 2 || updateObj.fullname.length > 255)) {
            throw new Error("Full name must be between 2 and 255 characters");
        }
        if (updateObj.username && (updateObj.username.length < 3 || updateObj.username.length > 50)) {
            throw new Error("Username must be between 3 and 50 characters");
        }

        // 4. Username Uniqueness Check
        if (updateObj.username && updateObj.username !== user.username) {
            const existingUser = await userModel.findOne({
                where: { username: updateObj.username },
            });
            if (existingUser) {
                throw new Error("Username already taken");
            }
        }

        // 5. Update using best practice
        await user.update(updateObj);

        // 6. Return fresh data
        return await getProfile(userId);
    } catch (error) {
        throw error;
    }
};

const changePassword = async (userId, oldPassword, newPassword) => {
    try {
        const user = await userModel.findByPk(userId);
        if (!user) {
            throw new Error("User not found");
        }

        // Verify old password
        const isMatch = await bcrypt.compare(oldPassword, user.password);
        if (!isMatch) {
            throw new Error("Old password incorrect");
        }

        const newPasswordHashed = await bcrypt.hash(newPassword, 10);

        await userModel.update({ password: newPasswordHashed }, { where: { userId: userId } });

        return { message: "Password changed successfully" };
    } catch (error) {
        throw error;
    }
};

const findUser = async (query) => {
    try {
        if (!query) return [];

        let normalizedPhone = query;
        if (query && !query.includes("@") && query.replace(/\D/g, "").length >= 9) {
            normalizedPhone = getPhoneDigits(query);
        }

        const users = await userModel.findAll({
            attributes: USER_SAFE_ATTRIBUTES,
            where: {
                [Op.or]: [
                    { email: { [Op.like]: `%${query}%` } },
                    { phoneNumber: { [Op.like]: `%${normalizedPhone}%` } },
                    { fullname: { [Op.like]: `%${query}%` } },
                    { username: { [Op.like]: `%${query}%` } }
                ],
            },
            limit: 20
        });

        // Map to ensure user_id is present (compatibility)
        return users.map(u => {
            const plain = u.get({ plain: true });
            plain.user_id = plain.userId;
            return plain;
        });
    } catch (error) {
        console.error("📌 [findUser] error:", error.message);
        throw error;
    }
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
