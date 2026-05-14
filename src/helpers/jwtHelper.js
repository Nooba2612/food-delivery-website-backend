const { jwtDecode } = require("jwt-decode");
const jwt = require("jsonwebtoken");

const getPayload = (user) => {
    // Safely extract values from Sequelize instance or plain object
    const userId = user?.dataValues?.userId || user?.userId || user?.dataValues?.user_id || user?.user_id;
    const username = user?.dataValues?.username || user?.username;
    const role = user?.dataValues?.role || user?.role;

    return {
        user_id: userId,
        username: username,
        role: role,
    };
};

const generateJWT = (user, expiresIn) => {
    const jwtSecretKey = process.env.JWT_SECRET || process.env.JWT_SECRET_KEY;
    const payload = getPayload(user);
    return jwt.sign(payload, jwtSecretKey, { expiresIn: expiresIn || "1h" });
};

const generateTokens = (user, customAccessExpires, customRefreshExpires) => {
    const accessSecret = process.env.JWT_SECRET_KEY;
    const refreshSecret = process.env.JWT_SECRET_KEY;

    const accessExpires = customAccessExpires || process.env.JWT_EXPIRES_IN;
    const refreshExpires = customRefreshExpires || process.env.JWT_REFRESH_EXPIRES_IN;

    const payload = getPayload(user);

    const accessToken = jwt.sign(payload, accessSecret, { expiresIn: accessExpires });
    const refreshToken = jwt.sign(payload, refreshSecret, { expiresIn: refreshExpires });

    return { accessToken, refreshToken };
};

const parseExpiry = (expiry) => {
    if (!expiry) return 3600 * 1000; // default 1h
    const value = parseInt(expiry);
    const unit = expiry.slice(-1);

    switch (unit) {
        case "h":
            return value * 60 * 60 * 1000;
        case "d":
            return value * 24 * 60 * 60 * 1000;
        case "m":
            return value * 60 * 1000;
        default:
            return value * 1000;
    }
};

const getCookie = (name) => {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);

    if (parts.length === 2) {
        return parts.pop().split(";").shift();
    }
    return null;
};

module.exports = {
    generateJWT,
    generateTokens,
    parseExpiry,
};
