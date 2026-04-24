const adminRouter = require("./adminRouter");
const chatRouter = require("./chatRouter");
const dishRouter = require("./dishRouter");
const uploadRoute = require("./upload");
const authRouter = require("./authRouter");
const categoryRouter = require("./categoryRouter");
const usersRouter = require("./userRouter");
const cartRouter = require("./cartRouter");
const voucherRouter = require("./voucherRouter");
const callRouter = require("./callRouter");
const orderRouter = require("./orderRouter");
const reviewRouter = require("./reviewRouter");
const chatbotRouter = require("./chatbotRouter");
const supportChatRouter = require("./supportChatRouter");
const { authAdminMiddleware, authMiddleware } = require("@middlewares/authMiddleware");

const routes = (app) => {
    app.use("/api/dish", dishRouter);
    app.use("/api/upload", uploadRoute);
    app.use("/api/auth", authRouter);
    app.use("/api/category", categoryRouter);
    app.use("/api/conversations", chatRouter);
    app.use("/api/user", authMiddleware, usersRouter);
    app.use("/api/cart", authMiddleware, cartRouter);
    app.use("/api/voucher", authMiddleware, voucherRouter);
    app.use("/api/calls", authMiddleware, callRouter);
    app.use("/api/orders", authMiddleware, orderRouter);
    app.use("/api/admin", adminRouter);
    app.use("/api", reviewRouter);
    app.use("/api/chat", chatbotRouter);
    app.use("/api/support", authMiddleware, supportChatRouter);
};

module.exports = routes;
