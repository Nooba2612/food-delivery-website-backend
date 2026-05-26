const express = require("express");
const router = express.Router();

const categoryController = require("./category.controller");

/**
 * @swagger
 * /api/category:
 *   get:
 *     summary: Get all categories
 *     tags:
 *       - Category
 *     responses:
 *       200:
 *         description: Categories retrieved successfully
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
 *                     $ref: '#/components/schemas/Category'
 */
router.get("/", categoryController.getCategories);

module.exports = router;
