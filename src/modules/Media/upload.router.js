const express = require("express");
const router = express.Router();
const upload = require("@core/middlewares/upload");

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
router.post("/", upload.single("image"), (req, res) => {
  res.json({
    url: req.file.path,
  });
});

module.exports = router;
