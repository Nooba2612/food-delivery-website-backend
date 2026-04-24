const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");
const { userModel } = require("./src/models");
const dotEnv = require("dotenv");

dotEnv.config();

async function createAdmin() {
    try {
        const phone = "0123456789";
        const password = "Admin@123";
        const hashedPassword = await bcrypt.hash(password, 10);

        // Check if exists
        const existing = await userModel.findOne({ where: { phone_number: phone } });
        if (existing) {
            console.log("Admin account already exists!");
            process.exit(0);
        }

        await userModel.create({
            userId: uuidv4(),
            fullname: "Administrator",
            username: "admin",
            email: "admin@eatsy.com",
            phoneNumber: phone,
            countryCode: "+84",
            password: hashedPassword,
            role: "Admin",
            typeLogin: "Standard",
            isOnline: false
        });

        console.log("✅ Admin account created successfully!");
        console.log("Phone: " + phone);
        console.log("Password: " + password);
        process.exit(0);
    } catch (error) {
        console.error("❌ Error creating admin:", error);
        process.exit(1);
    }
}

createAdmin();
