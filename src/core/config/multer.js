const multer = require("multer");
const path = require("path");
const AWS = require("aws-sdk");

const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const region = process.env.AWS_REGION || "ap-southeast-1";

let s3;
if (accessKeyId && secretAccessKey && !accessKeyId.includes("dummy") && !secretAccessKey.includes("dummy")) {
    s3 = new AWS.S3({
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey,
        region: region,
    });
} else {
    console.warn("AWS S3 credentials missing or invalid. S3 uploads will use development fallback.");
}

// ===== S3 Storage Configuration =====
const s3Storage = multer.memoryStorage(); // Store in memory before uploading to S3

// ===== MESSAGE ATTACHMENTS UPLOAD =====
const messageUpload = multer({
    storage: s3Storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    fileFilter: (req, file, cb) => {
        const allowedMimes = [
            // Images
            "image/jpeg",
            "image/png",
            "image/gif",
            "image/webp",
            "image/bmp",
            // Documents
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "text/plain",
            "text/csv",
            // Archives
            "application/zip",
            "application/x-rar-compressed",
            "application/gzip",
            // Audio
            "audio/mpeg",
            "audio/wav",
            "audio/ogg",
            "audio/webm",
            // Video
            "video/mp4",
            "video/webm",
        ];

        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`File type ${file.mimetype} not allowed.`));
        }
    },
});

// ===== CONVERSATION AVATAR UPLOAD =====
const conversationUpload = multer({
    storage: s3Storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
        const allowedMimes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error("Invalid file type. Only images allowed."));
        }
    },
});

// ===== USER PROFILE AVATAR UPLOAD =====
const profileUpload = multer({
    storage: s3Storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
        const allowedMimes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error("Invalid file type. Only images allowed."));
        }
    },
});

/**
 * Upload file to AWS S3
 * @param {Object} file - File object from multer
 * @param {string} folder - Folder name in S3 bucket (e.g., 'messages', 'conversations')
 * @returns {Promise<string>} - S3 file URL
 */
const uploadToS3 = async (file, folder) => {
    if (!file) return null;

    if (!s3) {
        console.warn(`[DEV MODE] Skipping S3 upload for ${file.originalname}. Returning placeholder.`);
        // Return a data URI or a placeholder URL in dev mode
        return `https://via.placeholder.com/150?text=${encodeURIComponent(file.originalname)}`;
    }

    const bucketName = process.env.AWS_S3_BUCKET || "food-delivery";
    const timestamp = Date.now();
    const random = Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    const name = path
        .basename(file.originalname, ext)
        .replace(/[^a-z0-9.-]/gi, "_")
        .toLowerCase();
    const key = `${folder}/${timestamp}-${random}-${name}${ext}`;

    const params = {
        Bucket: bucketName,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
    };

    try {
        const result = await s3.upload(params).promise();
        return result.Location;
    } catch (error) {
        console.error("S3 upload error:", error.message);
        if (process.env.NODE_ENV !== "production") {
            return `https://via.placeholder.com/150?text=UploadError`;
        }
        throw new Error(`Failed to upload to S3: ${error.message}`);
    }
};

module.exports = {
    messageUpload,
    conversationUpload,
    profileUpload,
    uploadToS3,
    s3,
};

