const bcrypt = require("bcrypt");
const { v4: uuidv4 } = require("uuid");

const hashData = async (plainData) => {
    const saltRounds = 10;

    try {
        const salt = await bcrypt.genSalt(saltRounds);
        const hashedData = await bcrypt.hash(plainData, salt);
        return hashedData;
    } catch (error) {
        console.error("Error hashing data:", error);
        throw new Error("Hashing failed");
    }
};

const compareHashedData = async (data, hashedData) => {
    return await bcrypt.compareSync(data, hashedData);
};

module.exports = {
    hashData,
    compareHashedData,
};
