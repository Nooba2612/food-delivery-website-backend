const cloudinary = require("cloudinary").v2;

const cloudName = process.env.CLOUD_NAME;
const apiKey = process.env.API_KEY;
const apiSecret = process.env.API_SECRET;

if (cloudName && apiKey && apiSecret && !cloudName.includes("dummy") && !apiKey.includes("dummy") && !apiSecret.includes("dummy")) {
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
  });
} else {
  console.warn("Cloudinary credentials missing or invalid. Image uploads may fail.");
}

module.exports = cloudinary;