const bcrypt = require("bcryptjs");
const { Op } = require("sequelize");

const { addressModel, userModel } = require("@models");

const getUserByPhoneNumber = async (countryCode, phoneNumber) => {
    try {
        const user = await userModel.findOne({
            where: { countryCode: countryCode, phoneNumber: phoneNumber },
        });
        return user;
    } catch (error) {
        throw error;
    }
};

const getUserByEmail = async (email) => {
    try {
        const user = await userModel.findOne({ where: { email: email } });
        return user;
    } catch (error) {
        throw error;
    }
};

const getProfile = async (userId) => {
    try {
        const user = await userModel.findByPk(userId, {
            attributes: {
                exclude: ["password"],
            },
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
        return user?.dataValues;
    } catch (error) {
        throw error;
    }
};

const createUser = async (username, type_login, country_code, phone_number, password) => {
    try {
        const newUser = await userModel.create({
            username,
            typeLogin: type_login,
            phoneNumber: phone_number,
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
        const user = await userModel.findOne({
            where: {
                [Op.or]: [{ email: query }, { phoneNumber: query }, { fullname: query }, { username: query }],
            },
        });
        if (!user) {
            throw new Error("User not found");
        }
        return user.toJSON();
    } catch (error) {
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
