const usersRouter = require("./userRouter");
const authRouter = require("./authRouter");
const dishRouter = require("./dishRouter");
const cartRouter = require("./cartRouter");
const voucherRouter = require("./voucherRouter");
const categoryRouter = require("./categoryRouter");
const uploadRoute = require("./upload");
const chatRouter = require("./chatRouter");
const callRouter = require("./callRouter");
const { authAdminMiddleware, authMiddleware } = require("@middlewares/authMiddleware");

const routes = (app) => {
    app.use("/api/dish", dishRouter);
    app.use("/api/upload", uploadRoute);
    app.use("/api/user", authMiddleware, usersRouter);
    app.use("/api/auth", authRouter);
    app.use("/api/cart", authMiddleware, cartRouter);
    app.use("/api/voucher", authMiddleware, voucherRouter);
    app.use("/api/category", categoryRouter);
    app.use("/api/conversations", chatRouter);
    app.use("/api/messages", authMiddleware, chatRouter);
    app.use("/api/calls", authMiddleware, callRouter);
};

module.exports = routes;
