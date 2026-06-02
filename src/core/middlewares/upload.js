const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("@core/config/cloudinary");

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "food-app",
    resource_type: (req, file) => {
      if (!file || !file.mimetype) return "auto";
      if (file.mimetype.startsWith("image/")) return "image";
      if (file.mimetype.startsWith("video/") || file.mimetype.startsWith("audio/")) return "video";
      return "raw";
    },
  },
});

const upload = multer({ storage });

module.exports = upload;
