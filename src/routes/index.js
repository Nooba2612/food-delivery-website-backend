// ═══════════════════════════════════════════════════════════════
// Module Routers - Imported from modular architecture
// ═══════════════════════════════════════════════════════════════
const authRouter = require("@modules/Auth/auth.router");
const dishRouter = require("@modules/Dish/dish.router");
const categoryRouter = require("@modules/Dish/category.router");
const usersRouter = require("@modules/User/user.router");
const cartRouter = require("@modules/Cart/cart.router");
const orderRouter = require("@modules/Order/order.router");
const vnPayRouter = require("@modules/Order/vnpay.router");
const chatRouter = require("@modules/Chat/chat.router");
const chatbotRouter = require("@modules/Chat/chatbot.router");
const callRouter = require("@modules/Chat/call.router");
const supportChatRouter = require("@modules/Chat/support.router");
const voucherRouter = require("@modules/Voucher/voucher.router");
const reviewRouter = require("@modules/Review/review.router");
const adminRouter = require("@modules/Admin/admin.router");
const uploadRouter = require("@modules/Media/upload.router");
const path = require("path");
const {
  authAdminMiddleware,
  authMiddleware,
} = require("@core/middlewares/authMiddleware");

const routes = (app) => {
  app.get("/", (req, res) => {
    res.redirect("/status");
  });

  app.get("/status", (req, res) => {
    res.sendFile(
      path.join(process.cwd(), "src", "public", "server-status.html"),
    );
  });

  // ── Auth Module ───────────────────────────────────────────
  app.use("/api/auth", authRouter);

  // ── Dish Module ───────────────────────────────────────────
  app.use("/api/dish", dishRouter);
  app.use("/api/category", categoryRouter);

  // ── User Module ───────────────────────────────────────────
  app.use("/api/user", authMiddleware, usersRouter);

  // ── Cart Module ───────────────────────────────────────────
  app.use("/api/cart", authMiddleware, cartRouter);

  // ── Order Module ──────────────────────────────────────────
  app.use("/api/orders", authMiddleware, orderRouter);
  app.use("/api/vnpay", vnPayRouter);

  // ── Chat Module ───────────────────────────────────────────
  app.use("/api/conversations", chatRouter);
  app.use("/api/chat", chatbotRouter);
  app.use("/api/calls", authMiddleware, callRouter);
  app.use("/api/support", authMiddleware, supportChatRouter);

  // ── Voucher Module ────────────────────────────────────────
  app.use("/api/voucher", voucherRouter); // Auth handled in router

  // ── Review Module ─────────────────────────────────────────
  app.use("/api", reviewRouter);

  // ── Admin Module ──────────────────────────────────────────
  app.use("/api/admin", adminRouter);

  // ── Media Module ──────────────────────────────────────────
  app.use("/api/upload", uploadRouter);
};

module.exports = routes;
