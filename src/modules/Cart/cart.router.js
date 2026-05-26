const cartController = require("./cart.controller");
const express = require("express");
const router = express.Router();
const { authMiddleware } = require("@core/middlewares/authMiddleware");

// All cart routes require authentication
router.use(authMiddleware);

/**
 * @swagger
 * /api/cart:
 *   get:
 *     summary: Get cart details and items
 *     tags: [Cart]
 */
router.get("/", cartController.getCart);

/**
 * @swagger
 * /api/cart/items:
 *   post:
 *     summary: Add item to cart
 *     tags: [Cart]
 */
router.post("/items", cartController.addItem);

/**
 * @swagger
 * /api/cart/items/{id}:
 *   put:
 *     summary: Update cart item quantity
 *     tags: [Cart]
 */
router.put("/items/:id", cartController.updateItem);

/**
 * @swagger
 * /api/cart/items/{id}:
 *   delete:
 *     summary: Remove single item from cart
 *     tags: [Cart]
 */
router.delete("/items/:id", cartController.deleteItem);

/**
 * @swagger
 * /api/cart/items/clear:
 *   delete:
 *     summary: Clear entire cart
 *     tags: [Cart]
 */
router.delete("/items/clear", cartController.clearCart);

module.exports = router;
