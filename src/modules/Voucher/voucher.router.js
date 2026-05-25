const voucherController = require("./voucher.controller");
const express = require("express");
const { authMiddleware } = require("@core/middlewares/authMiddleware");
const router = express.Router();

/**
 * @swagger
 * /api/voucher:
 *   get:
 *     summary: Get all active vouchers (Public)
 *     tags:
 *       - Voucher
 *     responses:
 *       200:
 *         description: List of active vouchers
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
 *                     $ref: '#/components/schemas/Voucher'
 */
router.get("/", voucherController.getAllVouchers); // Public - no auth needed

/**
 * @swagger
 * /api/voucher/check-voucher:
 *   post:
 *     summary: Check voucher validity
 *     tags:
 *       - Voucher
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               voucher_code:
 *                 type: string
 *               total_amount:
 *                 type: number
 *                 description: Total order amount
 *     responses:
 *       200:
 *         description: Voucher validated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 discount:
 *                   type: number
 *                 voucher:
 *                   $ref: '#/components/schemas/Voucher'
 *       400:
 *         description: Invalid or expired voucher
 *       401:
 *         description: Unauthorized
 */
router.post("/check-voucher", authMiddleware, voucherController.checkVoucher); // Protected

module.exports = router;
