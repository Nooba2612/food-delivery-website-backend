const { v4: uuidv4 } = require("uuid");

const otpModel = require("./models/otpModel");
const { Op } = require("sequelize");

const generateOTP = (length = 6) => {
  refreshOTP();
  const digits = "0123456789";
  let otp = "";
  for (let i = 0; i < length; i++) {
    otp += digits[Math.floor(Math.random() * 10)];
  }

  return otp;
};

const refreshOTP = async () => {
  try {
    await otpModel.destroy({
      where: {
        expires_at: {
          [Op.lte]: new Date(),
        },
      },
    });
  } catch (error) {
    console.log("Refresh OTP failed" + error);
  }
};

const { normalizePhone, getPhoneDigits } = require("@core/helpers/phoneHelper");

const saveOTP = async (countryCode, info, otp) => {
  const expirationTime = new Date();
  expirationTime.setMinutes(expirationTime.getMinutes() + 10);
  const otpId = uuidv4();

  // Use 9 digits for info if it's a phone number (not an email)
  let infoToStore = info;
  if (countryCode && info && !info.includes("@")) {
    infoToStore = getPhoneDigits(info);
  }

  try {
    await otpModel.create({
      otp_id: otpId,
      country_code: countryCode || "",
      info: infoToStore,
      otp: otp,
      expires_at: expirationTime,
    });
  } catch (error) {
    console.error("Error saving OTP:", error);
  }
};

const checkOTP = async (countryCode, info, otp) => {
  // Use 9 digits for info if it's a phone number (not an email)
  let infoToSearch = info;
  if (countryCode && info && !info.includes("@")) {
    infoToSearch = getPhoneDigits(info);
  }

  try {
    let otpEntry = await otpModel.findOne({
      where: {
        country_code: {
          [Op.or]: ["", countryCode],
        },
        info: infoToSearch,
      },
      order: [["expires_at", "DESC"]],
    });

    if (!otpEntry) {
      console.log("No OTP found for", infoToSearch);
      return false; // No OTP found
    }

    const { otp: storedOTP, expires_at } = otpEntry;
    const now = new Date();

    // Check expiration
    if (now > new Date(expires_at)) {
      console.log("OTP expired");
      return false; // OTP expired
    }

    // Check OTP
    if (storedOTP !== otp) {
      console.log("Invalid OTP");
      console.log("storedOTP: " + storedOTP + " otp: " + otp);
      return false; // Invalid OTP
    }

    return true; // OTP is valid
  } catch (error) {
    console.error("Error checking OTP:", error);
    throw error; // Optionally rethrow the error to handle it elsewhere
  }
};

const deleteOTP = async (countryCode, info) => {
  // Use 9 digits for info if it's a phone number (not an email)
  let infoToDelete = info;
  if (countryCode && info && !info.includes("@")) {
    infoToDelete = getPhoneDigits(info);
  }

  try {
    const result = await otpModel.destroy({
      where: { country_code: countryCode, info: infoToDelete },
    });

    if (result > 0) {
      console.log("OTP deleted for info:", infoToDelete);
    } else {
      console.log("No OTP found for info:", infoToDelete);
    }
  } catch (error) {
    console.error("Error deleting OTP:", error);
  }
};

module.exports = {
  generateOTP,
  saveOTP,
  checkOTP,
  deleteOTP,
  refreshOTP,
};
