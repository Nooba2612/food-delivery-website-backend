const express = require("express");
const router = express.Router();
const reviewController = require("./review.controller");
const { authMiddleware } = require("@core/middlewares/authMiddleware");

/**
 * @swagger
 * tags:
 *   name: Reviews
 *   description: Review management
 */

/**
 * @swagger
 * /api/dish/{dishId}/reviews:
 *   get:
 *     summary: Lấy tất cả reviews của món ăn
 *     tags: [Reviews]
 *     parameters:
 *       - in: path
 *         name: dishId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của món ăn
 *     responses:
 *       200:
 *         description: Danh sách reviews
 *       404:
 *         description: Món ăn không tồn tại
 */
router.get("/dish/:dishId/reviews", reviewController.getReviewsByDish);

/**
 * @swagger
 * /api/dish/{dishId}/reviews:
 *   post:
 *     summary: Tạo review mới cho món ăn
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: dishId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của món ăn
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - points
 *               - content
 *             properties:
 *               points:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 5
 *                 description: Điểm đánh giá (0-5)
 *               content:
 *                 type: string
 *                 description: Nội dung đánh giá
 *     responses:
 *       201:
 *         description: Tạo review thành công
 *       400:
 *         description: Dữ liệu không hợp lệ hoặc đã review rồi
 *       401:
 *         description: Chưa đăng nhập
 */
router.post(
  "/dish/:dishId/reviews",
  authMiddleware,
  reviewController.createReview,
);

/**
 * @swagger
 * /api/reviews/{reviewId}:
 *   put:
 *     summary: Cập nhật review
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reviewId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của review
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               points:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 5
 *               content:
 *                 type: string
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *       403:
 *         description: Không có quyền
 *       404:
 *         description: Review không tồn tại
 */
router.put("/reviews/:reviewId", authMiddleware, reviewController.updateReview);

/**
 * @swagger
 * /api/reviews/{reviewId}:
 *   delete:
 *     summary: Xóa review
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reviewId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của review
 *     responses:
 *       200:
 *         description: Xóa thành công
 *       403:
 *         description: Không có quyền
 *       404:
 *         description: Review không tồn tại
 */
router.delete(
  "/reviews/:reviewId",
  authMiddleware,
  reviewController.deleteReview,
);

/**
 * @swagger
 * /api/user/reviews:
 *   get:
 *     summary: Lấy tất cả reviews của user hiện tại
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách reviews của user
 *       401:
 *         description: Chưa đăng nhập
 */
router.get("/user/reviews", authMiddleware, reviewController.getUserReviews);

module.exports = router;
