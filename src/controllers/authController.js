const { v4: uuidv4 } = require("uuid");

const { createVerification } = require("@config/twilio");
const {
  saveOTP,
  generateOTP,
  checkOTP,
  deleteOTP,
} = require("@services/otpService");
const { compareHashedData, hashData } = require("@helpers/validationHelper");
const {
  getUserByPhoneNumber,
  createUser,
  getUserById,
  getUserByEmail,
  changePassword,
} = require("@services/userService");
const { generateJWT, generateTokens } = require("@helpers/jwtHelper");
const { regexVietnamPhoneNumber, regexEmail } = require("@constants/constants");
const { sendEmail } = require("@config/nodemailer");

class authController {
  async sendOTP(req, res) {
    try {
      const { phone, country, countryCode: bodyCountryCode, resendOTP } = req.body;
      const countryCode = bodyCountryCode || (country?.countryCode);

      if (!phone || !countryCode) {
        res.status(400).json({ success: false, message: "Failed to send OTP" });
      }

      if (resendOTP) {
        await deleteOTP(countryCode, phone);
      }

      const otp = generateOTP();
      console.log(`[OTP] Generated for ${countryCode}${phone}: ${otp}`);

      await saveOTP(countryCode, phone, otp);
      console.log(`[OTP] Saved to database for ${countryCode}${phone}`);

      const twilioResult = await createVerification(countryCode + phone, otp, "verification");

      if (!twilioResult.success) {
        // If it's a configuration issue (dummy credentials), we might still want fallback in dev
        if (twilioResult.error === "Twilio misconfigured" && process.env.NODE_ENV !== "production") {
            console.warn("Twilio misconfigured, using development OTP fallback");
            return res.status(200).json({
                success: true,
                message: "Development OTP fallback",
                otp: otp,
            });
        }
        
        console.error(`[Twilio] SMS Delivery Failed for ${countryCode}${phone}:`, twilioResult.error);
        return res.status(400).json({ success: false, message: "Failed to send OTP SMS" });
      }

      console.log(`[Twilio] SMS Sent Successfully to ${countryCode}${phone}`);
      res.status(200).json({ success: true, message: "OTP sent successfully" });
    } catch (error) {
      console.log(error);
      return res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }
  }

  async verifyOTP(req, res) {
    try {
      const { otp, phone, country, countryCode: bodyCountryCode } = req.body;
      const countryCode = bodyCountryCode || (country?.countryCode);

      if (!otp || !phone || !countryCode) {
        return res
          .status(400)
          .json({ success: false, message: "Missing required fields" });
      }

      const user = await getUserByPhoneNumber(countryCode, phone);

      const isValidOTP = await checkOTP(countryCode, phone, otp);
      console.log("🚀  isValidOTP:", isValidOTP);

      if (isValidOTP) {
        return res.status(200).json({
          success: true,
          message: "OTP verified successfully",
          existUser: user ? true : false,
        });
      } else {
        return res
          .status(400)
          .json({ success: false, message: "Invalid or expired OTP" });
      }
    } catch (error) {
      console.error("Error verifying OTP:", error);
      return res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }
  }

  async loginUser(req, res) {
    try {
      const {
        phone,
        countryCode: bodyCountryCode,
        password,
        memorizedLogin,
        country,
      } = req.body;
      const countryCode = bodyCountryCode || (country && country.countryCode);

      console.log("BODY:", req.body); // ✅ debug xem Postman gửi gì lên

      if (!phone || !countryCode || !password) {
        return res
          .status(400)
          .json({ success: false, message: "Missing required fields" });
      }

      const user = await getUserByPhoneNumber(countryCode, phone);
      console.log("USER:", user);

      if (!user) {
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      }

      const isValidPassword = await compareHashedData(password, user.password);

      if (!isValidPassword) {
        return res.json({ success: false, message: "Login user failed" });
      }

      const jwtExpiresIn =
        memorizedLogin === "true"
          ? process.env.JWT_EXPIRES_IN_30D
          : process.env.JWT_EXPIRES_IN_1H;

      const cookieMaxAge =
        memorizedLogin === "true"
          ? process.env.COOKIE_MAX_AGE_30D
          : process.env.COOKIE_MAX_AGE_1H;

      const tokens = generateTokens(user);

      res.cookie("token", tokens.accessToken, { maxAge: parseInt(cookieMaxAge) });

      return res.status(200).json({
        success: true,
        message: "User login successfully",
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: user,
        redirect: user.role === "Admin" ? "/admin" : "/",
      });
    } catch (error) {
      console.log("LOGIN ERROR:", error);

      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  async registerUser(req, res) {
    try {
      const {
        username,
        phone,
        countryCode: bodyCountryCode,
        password,
        memorizedLogin,
        country,
      } = req.body;
      const countryCode = bodyCountryCode || (country && country.countryCode);

      console.log("BODY:", req.body); // debug

      if (!username || !phone || !countryCode || !password) {
        return res
          .status(400)
          .json({ success: false, message: "Missing required fields" });
      }

      const hashedPassword = await hashData(password);
      const typeLogin = "Standard";

      await createUser(username, typeLogin, countryCode, phone, hashedPassword);

      console.log("User created"); // debug

      const user = await getUserByPhoneNumber(countryCode, phone);

      if (!user) {
        return res
          .status(400)
          .json({ success: false, message: "Register user failed" });
      }

      const jwtExpiresIn =
        memorizedLogin === "true"
          ? process.env.JWT_EXPIRES_IN_30D
          : process.env.JWT_EXPIRES_IN_1H;

      const cookieMaxAge =
        memorizedLogin === "true"
          ? process.env.COOKIE_MAX_AGE_30D
          : process.env.COOKIE_MAX_AGE_1H;

      const tokens = generateTokens(user);

      res.cookie("token", tokens.accessToken, { maxAge: parseInt(cookieMaxAge) });

      return res.status(200).json({
        success: true,
        message: "User registered successfully",
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: user,
        redirect: user.role === "Admin" ? "/admin" : "/",
      });
    } catch (error) {
      console.log("REGISTER ERROR:", error);

      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  async loginStatus(req, res) {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized - No user",
        });
      }

      const userId = req.user.user_id || req.user.userId || req.user.id;

      // ✅ DEBUG LOGS
      console.log("LOGIN STATUS req.user:", JSON.stringify(req.user, null, 2));
      console.log("LOGIN STATUS userId:", userId);

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized - Invalid user ID",
        });
      }

      const user = await getUserById(userId);
      const { memorizedLogin } = req.cookies;

      if (!user) {
        return res
          .status(401)
          .json({ success: false, message: "Unauthorized" });
      }

      const jwtExpiresIn =
        memorizedLogin === "true"
          ? process.env.JWT_EXPIRES_IN_30D
          : process.env.JWT_EXPIRES_IN_1H;
      const token = generateJWT(user, jwtExpiresIn); // create token
      return res.json({ 
        success: true, 
        message: "Login successful!",
        accessToken: token,
        user: user
      });
    } catch (error) {
      console.log(error);
    }
  }

  async forgotPasswordSendOTP(req, res) {
    const { info, countryCode, resendOTP } = req.body;
    const otp = generateOTP();

    if (!info) {
      console.log("\n\nInfo is null\n\n");
      return res.status(404).json({ success: false, message: "Info is null" });
    }

    if (resendOTP) {
      await deleteOTP(countryCode, info);
    }

    if (info && regexVietnamPhoneNumber.test(info)) {
      try {
        console.log(`[OTP] Generated Reset OTP for ${countryCode}${info}: ${otp}`);

        await saveOTP(countryCode, info, otp);
        console.log(`[OTP] Saved Reset OTP to database for ${countryCode}${info}`);

        const twilioResult = await createVerification(countryCode + info, otp, "reset");

        if (!twilioResult.success) {
          if (twilioResult.error === "Twilio misconfigured" && process.env.NODE_ENV !== "production") {
              console.warn("Twilio misconfigured, using development OTP fallback");
              return res.status(200).json({
                  success: true,
                  message: "Development OTP fallback",
                  otp: otp,
              });
          }
          
          console.error(`[Twilio] Reset SMS Delivery Failed for ${countryCode}${info}:`, twilioResult.error);
          return res.status(400).json({ success: false, message: "Failed to send OTP SMS" });
        }

        console.log(`[Twilio] Reset SMS Sent Successfully to ${countryCode}${info}`);
        return res.status(200).json({ success: true, message: "OTP sent successfully" });
      } catch (error) {
        console.error("Send otp to phone number failed:", error);
        return res.status(500).json({ success: false, message: "Failed to send OTP SMS" });
      }
    }

    if (info && regexEmail.test(info)) {
      try {
        sendEmail(
          info,
          "Xác nhận thiết lập lại mật khẩu Eatsy",
          "Vui lòng không cung cấp mã OTP cho bất kỳ ai. Mã OTP của bạn là: " +
            otp,
        );

        console.log("\n\nSent OTP: ", otp);

        saveOTP(null, info, otp);

        return res.status(200).json({ success: true });
      } catch (error) {
        console.log("Send otp to email failed: " + error);
      }
    }

    res.status(404).json({ success: false });
  }

  async forgotPasswordVerifyOTP(req, res) {
    try {
      const { otp, info } = req.body;
      console.log(otp);
      console.log(info);

      if (!otp || !info) {
        return res
          .status(400)
          .json({ success: false, message: "Missing required fields" });
      }

      const isValidOTP = await checkOTP("+84", info, otp);

      console.log("🚀  isValidOTP:", isValidOTP);

      if (isValidOTP) {
        return res
          .status(200)
          .json({ success: true, message: "OTP verified successfully" });
      } else {
        return res
          .status(400)
          .json({ success: false, message: "Invalid or expired OTP" });
      }
    } catch (error) {
      console.error("Error verifying OTP:", error);
      return res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }
  }

  async resetPassword(req, res) {
    const { newPassword, info } = req.body;
    let user;

    if (!newPassword || !info) {
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields" });
    }

    if (regexEmail.test(info)) {
      user = await getUserByEmail(info);
    }

    if (regexVietnamPhoneNumber.test(info)) {
      user = await getUserByPhoneNumber("+84", info);
    }

    if (!user) {
      return res
        .status(400)
        .json({ success: false, message: "Not found user" });
    }

    const userId = user.userId || user.user_id;
    const newPasswordHashed = await hashData(newPassword);

    await changePassword(userId, newPasswordHashed);

    res
      .status(200)
      .json({ success: true, message: "Change password successfully" });
  }

  async logoutUser(req, res) {
    try {
      return res.status(200).json({ success: true, message: "Logged out successfully" });
    } catch (error) {
      console.log("LOGOUT ERROR:", error);
      return res.status(500).json({ success: false, message: "Internal server error" });
    }
  }
  async refreshToken(req, res) {
    try {
      const { refreshToken } = req.body;
      
      if (!refreshToken) {
        return res.status(401).json({ success: false, message: "Refresh Token is required" });
      }

      console.log("REFRESH TOKEN USED");

      const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET;
      
      const jwt = require("jsonwebtoken");
      const decoded = jwt.verify(refreshToken, jwtRefreshSecret);
      
      // decoded will contain user_id, username, role
      // generate new access token (only access token using access secret)
      const accessSecret = process.env.JWT_SECRET || process.env.JWT_SECRET_KEY;
      const accessExpires = process.env.JWT_EXPIRES_IN || "15m";
      
      const newAccessToken = jwt.sign(
        {
          user_id: decoded.user_id,
          username: decoded.username,
          role: decoded.role
        },
        accessSecret,
        { expiresIn: accessExpires }
      );
      
      console.log("TOKEN REFRESHED");

      return res.status(200).json({
        success: true,
        accessToken: newAccessToken
      });
    } catch (error) {
      console.log("REFRESH TOKEN ERROR:", error.message);
      return res.status(401).json({ success: false, message: "Invalid or expired refresh token" });
    }
  }
}

module.exports = new authController();
