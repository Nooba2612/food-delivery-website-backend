const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");
const dotEnv = require("dotenv");

dotEnv.config();

const { userModel } = require("./src/models");

async function createAdmin() {
    try {
        const phone = "0987654321";
        const password = "Admin@123";
        const hashedPassword = await bcrypt.hash(password, 10);

        // Delete old one if exists to be clean
        await userModel.destroy({ where: { phone_number: "0123456789" } });

        // Check if new one exists
        const existing = await userModel.findOne({ where: { phone_number: phone } });
        if (existing) {
            await existing.update({ password: hashedPassword, role: "Admin" });
            console.log("✅ Tài khoản Admin (0987654321) đã được cập nhật mật khẩu!");
        } else {
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
            console.log("\n✅ ĐÃ TẠO TÀI KHOẢN ADMIN THÀNH CÔNG!");
        }

        console.log("Số điện thoại: " + phone);
        console.log("Mật khẩu: " + password);
        process.exit(0);
    } catch (error) {
        console.error("❌ Lỗi khi tạo admin:", error);
        process.exit(1);
    }
}

createAdmin();
