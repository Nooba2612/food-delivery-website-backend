const express = require("express");
const router = express.Router();
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { uploadToS3, s3 } = require("@core/config/multer");

// Sử dụng memory storage để có thể upload linh hoạt lên S3 hoặc lưu local
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

// Hàm fallback lưu file cục bộ vào thư mục public của Express
const saveLocally = (file) => {
  const uploadDir = path.join(process.cwd(), "src", "public", "uploads");
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
  const filepath = path.join(uploadDir, filename);
  fs.writeFileSync(filepath, file.buffer);
  
  // Trả về đường dẫn tương đối (Express static sẽ map /uploads/... trực tiếp)
  return `/uploads/${filename}`;
};

/**
 * @swagger
 * /api/upload:
 *   post:
 *     summary: Upload image file
 *     tags:
 *       - Upload
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Image file to upload
 *     responses:
 *       200:
 *         description: Image uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 url:
 *                   type: string
 *                   description: URL of the uploaded image
 *       400:
 *         description: Invalid file format
 *       500:
 *         description: Server error during upload
 */
router.post("/", upload.single("image"), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Vui lòng chọn một file để tải lên." });
    }

    console.log(`📤 Đang tải lên file: ${req.file.originalname} (${req.file.mimetype})`);

    // Luồng 1: Nếu AWS S3 được cấu hình đầy đủ, ưu tiên tải lên S3
    if (s3) {
      try {
        console.log("☁️ Đang thử tải lên AWS S3...");
        const s3Url = await uploadToS3(req.file, "support");
        if (s3Url && !s3Url.includes("placeholder")) {
          console.log(`✅ Tải lên S3 thành công! URL: ${s3Url}`);
          return res.json({ url: s3Url });
        }
      } catch (s3Error) {
        console.warn("⚠️ AWS S3 upload lỗi, đang chuyển sang lưu cục bộ:", s3Error.message);
      }
    }

    // Luồng 2: Fallback lưu cục bộ vào thư mục public/uploads
    console.log("💾 Đang lưu file cục bộ (Public fallback)...");
    const localUrl = saveLocally(req.file);
    
    // Tạo URL đầy đủ từ base url của backend
    const baseUrl = process.env.BASE_URL || "http://localhost:5678";
    const fullUrl = `${baseUrl}${localUrl}`;
    
    console.log(`✅ Lưu cục bộ thành công! URL: ${fullUrl}`);
    return res.json({ url: fullUrl });

  } catch (error) {
    console.error("❌ Lỗi xử lý tải lên file:", error);
    return res.status(500).json({ success: false, message: "Không thể lưu trữ hình ảnh trên server." });
  }
});

module.exports = router;
