const express = require("express");
const router = express.Router();
const multer = require("multer");
const { s3Storage } = require("@core/config/multer");

const dishController = require("./dish.controller");

// Multer middleware for dish image uploads
const dishImageUpload = multer({
  storage: s3Storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedMimes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Chỉ chấp nhận file ảnh: JPG, PNG, GIF, WEBP"));
    }
  },
});

/**
 * @swagger
 * /api/dish:
 *   get:
 *     summary: Get all dishes
 *     tags:
 *       - Dishes
 *     parameters:
 *       - in: query
 *         name: category_id
 *         schema:
 *           type: integer
 *         description: Filter by category ID
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Items per page
 *     responses:
 *       200:
 *         description: List of dishes retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Dish'
 *                 total:
 *                   type: integer
 */
router.get("/", dishController.getDishes);

/**
 * @swagger
 * /api/dish/{id}:
 *   get:
 *     summary: Get dish by ID
 *     tags:
 *       - Dishes
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Dish ID
 *     responses:
 *       200:
 *         description: Dish retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Dish'
 *       404:
 *         description: Dish not found
 */
router.get("/:id", dishController.getDishById);

/**
 * @swagger
 * /api/dish/similar/{id}:
 *   get:
 *     summary: Get similar dishes
 *     tags:
 *       - Dishes
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Dish ID
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 5
 *         description: Number of similar dishes to return
 *     responses:
 *       200:
 *         description: Similar dishes retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Dish'
 *       404:
 *         description: Dish not found
 */
router.get("/similar/:id", dishController.getSimilarDishes);
router.post("/", dishImageUpload.single("image"), dishController.createDish);
router.put("/:id", dishImageUpload.single("image"), dishController.updateDish);
router.delete("/:id", dishController.deleteDish);
module.exports = router;
