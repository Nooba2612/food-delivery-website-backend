const express = require("express");
const router = express.Router();

const userController = require("@controllers/userController");
const { profileUpload } = require("@config/multer");
const { authMiddleware } = require("../middlewares/authMiddleware");
const { body } = require("express-validator");
const validate = require("../middlewares/validate");

/**
 * @swagger
 * /api/user/search:
 *   get:
 *     summary: Find user by query
 *     tags:
 *       - User
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: keyword
 *         schema:
 *           type: string
 *         required: true
 *         description: Keyword to search (username, email, or phone)
 *     responses:
 *       200:
 *         description: User(s) found successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/User'
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 */
router.get("/search", authMiddleware, userController.findUser);

/**
 * @swagger
 * /api/user/profile:
 *   get:
 *     summary: Get user profile
 *     tags:
 *       - User
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       401:
 *         description: Unauthorized
 */
router.get("/profile", authMiddleware, userController.getProfile);

/**
 * @swagger
 * /api/user/profile:
 *   put:
 *     summary: Update user profile
 *     tags:
 *       - User
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               phone:
 *                 type: string
 *               email:
 *                 type: string
 *               avatar:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: User profile updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       400:
 *         description: Invalid input
 */
router.put(
    "/profile",
    authMiddleware,
    profileUpload.single("avatar"),
    [
        body("fullname")
            .optional()
            .trim()
            .isLength({ min: 2, max: 255 })
            .withMessage("Họ và tên phải từ 2 đến 255 ký tự"),
        body("username")
            .optional()
            .trim()
            .isLength({ min: 3, max: 50 })
            .withMessage("Tên đăng nhập phải từ 3 đến 50 ký tự"),
    ],
    validate,
    userController.updateProfile
);

/**
 * @swagger
 * /api/user/password:
 *   put:
 *     summary: Change user password
 *     tags:
 *       - User
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               old_password:
 *                 type: string
 *               new_password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password changed successfully
 *       400:
 *         description: Invalid old password
 */
router.put("/password", authMiddleware, userController.changePassword);

/**
 * @swagger
 * /api/user/addresses:
 *   get:
 *     summary: Get user addresses
 *     tags:
 *       - User - Addresses
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Addresses retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Address'
 *       401:
 *         description: Unauthorized
 */
router.get("/addresses", authMiddleware, userController.getAddresses);

/**
 * @swagger
 * /api/user/addresses:
 *   post:
 *     summary: Add new address
 *     tags:
 *       - User - Addresses
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               street:
 *                 type: string
 *               city:
 *                 type: string
 *               state:
 *                 type: string
 *               zip_code:
 *                 type: string
 *               is_default:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Address added successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Address'
 *       400:
 *         description: Invalid input
 */
router.post("/addresses", authMiddleware, userController.addAddress);

/**
 * @swagger
 * /api/user/addresses/{id}:
 *   put:
 *     summary: Update address
 *     tags:
 *       - User - Addresses
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               street:
 *                 type: string
 *               city:
 *                 type: string
 *               state:
 *                 type: string
 *               zip_code:
 *                 type: string
 *     responses:
 *       200:
 *         description: Address updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Address'
 *       404:
 *         description: Address not found
 */
router.put("/addresses/:id", authMiddleware, userController.updateAddress);

/**
 * @swagger
 * /api/user/addresses/{id}:
 *   delete:
 *     summary: Delete address
 *     tags:
 *       - User - Addresses
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Address deleted successfully
 *       404:
 *         description: Address not found
 */
router.delete("/addresses/:id", authMiddleware, userController.deleteAddress);

/**
 * @swagger
 * /api/user/addresses/{id}/default:
 *   put:
 *     summary: Set address as default
 *     tags:
 *       - User - Addresses
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Default address set successfully
 *       404:
 *         description: Address not found
 */
router.put("/addresses/:id/default", authMiddleware, userController.setDefaultAddress);
+
+/**
+ * @swagger
+ * /api/user/orders:
+ *   get:
+ *     summary: Get user order history
+ *     tags:
+ *       - User - Orders
+ *     security:
+ *       - BearerAuth: []
+ *     responses:
+ *       200:
+ *         description: Orders retrieved successfully
+ *       401:
+ *         description: Unauthorized
+ */
+router.get("/orders", authMiddleware, userController.getOrders);

/**
 * @swagger
 * /api/user/orders/{id}:
 *   get:
 *     summary: Get single order details
 *     tags:
 *       - User - Orders
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Order details retrieved successfully
 *       403:
 *         description: Access denied
 *       404:
 *         description: Order not found
 */
router.get("/orders/:id", authMiddleware, userController.getOrderDetails);

/**
 * @swagger
 * /api/user/orders/{id}/reorder:
 *   post:
 *     summary: Reorder items from a past order
 *     tags:
 *       - User - Orders
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Items added to cart successfully
 *       404:
 *         description: Order not found
 */
router.post("/orders/:id/reorder", authMiddleware, userController.reorder);


/**
 * @swagger
 * /api/user/orders:
 *   post:
 *     summary: Place a new order
 *     tags:
 *       - User - Orders
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               items:
 *                 type: array
 *               address_id:
 *                 type: string
 *               payment_method:
 *                 type: string
 *               note:
 *                 type: string
 *     responses:
 *       201:
 *         description: Order placed successfully
 */
router.post(
    "/orders",
    authMiddleware,
    [
        body("address_id").notEmpty().withMessage("Vui lòng chọn địa chỉ giao hàng"),
        body("items").isArray({ min: 1 }).withMessage("Giỏ hàng không được để trống"),
        body("items.*.dish_id").notEmpty().withMessage("Thiếu mã món ăn"),
        body("items.*.quantity").isInt({ min: 1 }).withMessage("Số lượng phải lớn hơn 0"),
    ],
    validate,
    userController.placeOrder,
);

module.exports = router;
