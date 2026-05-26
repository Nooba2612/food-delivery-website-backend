const orderController = require("./order.controller");
const express = require("express");
const router = express.Router();

// All order routes require authentication (already handled in main router but included for safety)
router.post("/", orderController.createOrderFromCart);
router.get("/my-orders", orderController.getMyOrders);
router.post("/:id/reorder", orderController.reorder); // Specific route first
router.get("/:id", orderController.getOrderDetail); // Generic route last

module.exports = router;
