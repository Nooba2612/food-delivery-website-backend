const bcrypt = require("bcryptjs");
const { Op } = require("sequelize");

const { addressModel, userModel } = require("@models");

const getUserByPhoneNumber = async (countryCode, phoneNumber) => {
    try {
        const user = await userModel.findOne({
            where: { country_code: countryCode, phone_number: phoneNumber },
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
                    attributes: { exclude: ["user_id"] },
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
        const user = await userModel.findByPk(userId);
        return user?.dataValues || user;
    } catch (error) {
        throw error;
    }
};

const createUser = async (username, type_login, country_code, phone_number, password) => {
    try {
        const newUser = await userModel.create({
            username,
            type_login,
            phone_number,
            country_code,
            password,
        });
        return newUser;
    } catch (error) {
        throw error;
    }
};

const updateProfile = async (userId, updateData, avatarFile = null) => {
    try {
        const allowedFields = ["fullname", "phone_number", "gender", "date_of_birth", "payment_method", "avatar_path"];
        const updateObj = {};

        for (const field of allowedFields) {
            if (updateData[field] !== undefined) {
                updateObj[field] = updateData[field];
            }
        }

        // Handle legacy avatar file upload (local storage)
        if (avatarFile && !updateData.avatar_path) {
            updateObj.avatar_path = `/uploads/avatars/${avatarFile.filename}`;
        }

        const [updatedCount] = await userModel.update(updateObj, {
            where: { user_id: userId },
            returning: true,
        });

        if (updatedCount === 0) {
            throw new Error("User not found");
        }

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

        await userModel.update({ password: newPasswordHashed }, { where: { user_id: userId } });

        return { message: "Password changed successfully" };
    } catch (error) {
        throw error;
    }
};

const findUser = async (query) => {
    try {
        const user = await userModel.findOne({
            where: {
                [Op.or]: [{ email: query }, { phone_number: query }, { fullname: query }, { username: query }],
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
