const { v4: uuidv4 } = require("uuid");

// Removed Twilio integration as per requirement
// const { createVerification } = require("@config/twilio");
const { saveOTP, generateOTP, checkOTP, deleteOTP } = require("./auth.service");
const {
  compareHashedData,
  hashData,
} = require("@core/helpers/validationHelper");
const {
  getUserByPhoneNumber,
  createUser,
  getUserById,
  getUserByEmail,
  changePassword,
} = require("./user.service");
const {
  generateJWT,
  generateTokens,
  parseExpiry,
} = require("@core/helpers/jwtHelper");
const {
  regexVietnamPhoneNumber,
  regexEmail,
} = require("@core/constants/constants");
const { sendEmail } = require("@core/config/nodemailer");
const {
  normalizePhone,
  getPhoneDigits,
  formatPhoneNumber,
} = require("@core/helpers/phoneHelper");

class authController {
  async sendOTP(req, res) {
    try {
      let {
        phone,
        country,
        countryCode: bodyCountryCode,
        resendOTP,
      } = req.body;
      const countryCode = bodyCountryCode || country?.countryCode;

      if (!phone || !countryCode) {
        return res
          .status(400)
          .json({ success: false, message: "Failed to send OTP" });
      }

      phone = getPhoneDigits(phone); // Always store 9 digits in DB

      if (resendOTP) {
        await deleteOTP(countryCode, phone);
      }

      const otp = generateOTP();
      const formattedPhone = formatPhoneNumber(phone); // +84XXXXXXXXX
      console.log(`[OTP] Generated for ${formattedPhone}: ${otp}`);

      await saveOTP(countryCode, phone, otp);
      console.log(`[OTP] Saved to database for ${phone}`);

      const isProd = process.env.NODE_ENV === "production";

      if (!isProd) {
        console.log(`\n==================================================`);
        console.log(`EATSY FOOD - OTP for ${formattedPhone}: ${otp}`);
        console.log(`==================================================\n`);
      } else {
        const user = await getUserByPhoneNumber(countryCode, phone);
        if (user && user.email) {
          sendEmail(
            user.email,
            "Eatsy Verification Code",
            `Your Eatsy verification code is: ${otp}`,
          );
        } else {
          console.warn(
            `[PROD] No email found for phone ${formattedPhone}. OTP logged to console: ${otp}`,
          );
        }
      }

      res.status(200).json({
        success: true,
        message: "OTP sent successfully",
        // In dev mode, return OTP to frontend for convenience if needed
        otp: !isProd ? otp : undefined,
      });
    } catch (error) {
      console.log(error);
      return res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }
  }

  async verifyOTP(req, res) {
    try {
      let { otp, phone, country, countryCode: bodyCountryCode } = req.body;
      const countryCode = bodyCountryCode || country?.countryCode;

      if (!otp || !phone || !countryCode) {
        return res
          .status(400)
          .json({ success: false, message: "Missing required fields" });
      }

      phone = getPhoneDigits(phone);

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
      let {
        phone,
        email,
        countryCode: bodyCountryCode,
        password,
        memorizedLogin,
        country,
      } = req.body;
      const countryCode = bodyCountryCode || (country && country.countryCode);

      if (phone && countryCode) {
        phone = getPhoneDigits(phone);
      }

      console.log("LOGIN ATTEMPT:", { phone, email, countryCode });

      if ((!phone || !countryCode) && !email) {
        return res
          .status(400)
          .json({
            success: false,
            message: "Vui lòng nhập số điện thoại hoặc email",
          });
      }

      if (!password) {
        return res
          .status(400)
          .json({ success: false, message: "Vui lòng nhập mật khẩu" });
      }

      let user;
      if (phone && countryCode) {
        user = await getUserByPhoneNumber(countryCode, phone);
      } else if (email) {
        user = await getUserByEmail(email);
      }

      console.log("USER FOUND:", user ? user.user_id : "None");

      if (!user) {
        return res
          .status(404)
          .json({ success: false, message: "Tài khoản không tồn tại" });
      }

      const isValidPassword = await compareHashedData(password, user.password);

      if (!isValidPassword) {
        return res
          .status(401)
          .json({ success: false, message: "Mật khẩu không chính xác" });
      }

      const isRemembered = memorizedLogin === true || memorizedLogin === "true";

      const jwtExpiresIn = isRemembered
        ? process.env.JWT_EXPIRES_IN_30D || "30d"
        : process.env.JWT_EXPIRES_IN_1H || "1h";

      const tokens = generateTokens(
        user,
        jwtExpiresIn,
        isRemembered ? "30d" : "7d",
      );

      const cookieMaxAge = parseExpiry(jwtExpiresIn);

      res.cookie("token", tokens.accessToken, {
        maxAge: cookieMaxAge,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
      });

      res.cookie("memorizedLogin", isRemembered, {
        maxAge: cookieMaxAge,
      });

      return res.status(200).json({
        success: true,
        message: "Đăng nhập thành công",
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: user,
        rememberMe: isRemembered,
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
      let {
        username,
        phone,
        countryCode: bodyCountryCode,
        password,
        memorizedLogin,
        country,
      } = req.body;
      const countryCode = bodyCountryCode || (country && country.countryCode);

      if (phone && countryCode) {
        phone = getPhoneDigits(phone);
      }

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

      const isRemembered = memorizedLogin === true || memorizedLogin === "true";

      const jwtExpiresIn = isRemembered
        ? process.env.JWT_EXPIRES_IN_30D || "30d"
        : process.env.JWT_EXPIRES_IN_1H || "1h";

      const tokens = generateTokens(
        user,
        jwtExpiresIn,
        isRemembered ? "30d" : "7d",
      );

      const cookieMaxAge = parseExpiry(jwtExpiresIn);

      res.cookie("token", tokens.accessToken, {
        maxAge: cookieMaxAge,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
      });

      res.cookie("memorizedLogin", isRemembered, {
        maxAge: cookieMaxAge,
      });

      return res.status(200).json({
        success: true,
        message: "User registered successfully",
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: user,
        rememberMe: isRemembered,
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

      const isRemembered = memorizedLogin === true || memorizedLogin === "true";
      const jwtExpiresIn = isRemembered
        ? process.env.JWT_EXPIRES_IN_30D
        : process.env.JWT_EXPIRES_IN_1H;

      const token = generateJWT(user, jwtExpiresIn);
      return res.json({
        success: true,
        message: "Login successful!",
        accessToken: token,
        user: user,
        rememberMe: isRemembered,
      });
    } catch (error) {
      console.log(error);
    }
  }

  async forgotPasswordSendOTP(req, res) {
    let { info, countryCode, resendOTP } = req.body;
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
        const rawPhone = getPhoneDigits(info);
        const formattedPhone = formatPhoneNumber(info);

        await saveOTP(countryCode, rawPhone, otp);

        const isProd = process.env.NODE_ENV === "production";

        if (!isProd) {
          console.log(`\n==================================================`);
          console.log(`EATSY FOOD - Reset OTP for ${formattedPhone}: ${otp}`);
          console.log(`==================================================\n`);
        } else {
          const user = await getUserByPhoneNumber(countryCode, rawPhone);
          if (user && user.email) {
            sendEmail(
              user.email,
              "Eatsy Password Reset",
              `Your password reset OTP is: ${otp}`,
            );
          } else {
            console.warn(
              `[PROD] No email found for phone ${formattedPhone} for reset. OTP: ${otp}`,
            );
          }
        }

        return res.status(200).json({
          success: true,
          message: "OTP sent successfully",
          otp: !isProd ? otp : undefined,
        });
      } catch (error) {
        console.error("Send otp to phone number failed:", error);
        return res
          .status(500)
          .json({ success: false, message: "Failed to send OTP SMS" });
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
      let { otp, info, countryCode: bodyCountryCode } = req.body;
      const countryCode = bodyCountryCode || "+84";

      if (!otp || !info) {
        return res
          .status(400)
          .json({ success: false, message: "Missing required fields" });
      }

      if (info && !info.includes("@")) {
        info = getPhoneDigits(info);
      }

      const isValidOTP = await checkOTP(countryCode, info, otp);

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
    let { newPassword, info, countryCode: bodyCountryCode } = req.body;
    const countryCode = bodyCountryCode || "+84";
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
      info = getPhoneDigits(info);
      user = await getUserByPhoneNumber(countryCode, info);
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
      res.clearCookie("token");
      res.clearCookie("memorizedLogin");
      return res
        .status(200)
        .json({ success: true, message: "Logged out successfully" });
    } catch (error) {
      console.log("LOGOUT ERROR:", error);
      return res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }
  }
  async refreshToken(req, res) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res
          .status(401)
          .json({ success: false, message: "Refresh Token is required" });
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
          role: decoded.role,
        },
        accessSecret,
        { expiresIn: accessExpires },
      );

      console.log("TOKEN REFRESHED");

      return res.status(200).json({
        success: true,
        accessToken: newAccessToken,
      });
    } catch (error) {
      console.log("REFRESH TOKEN ERROR:", error.message);
      return res
        .status(401)
        .json({ success: false, message: "Invalid or expired refresh token" });
    }
  }
}

module.exports = new authController();
