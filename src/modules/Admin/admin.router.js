const express = require("express");
const router = express.Router();
const AdminController = require("./admin.controller");

// Order management
router.get("/orders/stats", AdminController.getOrderStats);
router.get("/orders", AdminController.getOrders);
router.put("/orders/:id/status", AdminController.updateOrderStatus);

// Employee management
router.get("/employees", AdminController.getEmployees);
router.post("/employees", AdminController.addEmployee);
router.put("/employees/:id", AdminController.updateEmployee);
router.delete("/employees/:id", AdminController.deleteEmployee);

// Product management
router.get("/products/stats", AdminController.getProductStats);
router.get("/products", AdminController.getProducts);
router.post("/products", AdminController.addProduct);
router.put("/products/:id", AdminController.updateProduct);
router.delete("/products/:id", AdminController.deleteProduct);

// Categories
router.get("/categories", AdminController.getCategories);

module.exports = router;
