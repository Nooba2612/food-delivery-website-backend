const express = require("express");
const router = express.Router();
const passport = require("passport");

const authController = require("./auth.controller");
const { authMiddleware } = require("@core/middlewares/authMiddleware");

/**
 * @swagger
 * /api/auth:
 *   get:
 *     summary: Verify authentication
 *     tags:
 *       - Authentication
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Authentication successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 */
router.get("/", authMiddleware, (req, res) => {
  res.json({ success: true, message: "Request authenticated and processed!" });
});

/**
 * @swagger
 * /google:
 *   get:
 *     summary: Google OAuth login
 *     tags:
 *       - Authentication
 *     parameters:
 *       - in: query
 *         name: memorizedLogin
 *         schema:
 *           type: boolean
 *     responses:
 *       302:
 *         description: Redirect to Google OAuth
 */
router.get(
  "/google",
  (req, res, next) => {
    const { memorizedLogin } = req.query;
    res.cookie("memorizedLogin", memorizedLogin);

    // If request is from Axios (AJAX), don't redirect to and trigger CORS error
    if (
      req.xhr ||
      (req.headers.accept && req.headers.accept.includes("application/json"))
    ) {
      return res.json({ success: true, message: "Cookie set" });
    }
    next();
  },
  passport.authenticate("google", {
    scope: ["profile", "email"],
  }),
);

/**
 * @swagger
 * /google/redirect:
 *   get:
 *     summary: Google OAuth callback
 *     tags:
 *       - Authentication
 *     responses:
 *       302:
 *         description: Redirect to client with JWT token
 */
router.get(
  "/google/redirect",
  passport.authenticate("google", {
    successRedirect: `${process.env.CLIENT_URL}/login/status`,
    failureRedirect: `${process.env.CLIENT_URL}/login/status`,
  }),
);

/**
 * @swagger
 * /api/auth/facebook:
 *   get:
 *     summary: Facebook OAuth login
 *     tags:
 *       - Authentication
 *     parameters:
 *       - in: query
 *         name: memorizedLogin
 *         schema:
 *           type: boolean
 *     responses:
 *       302:
 *         description: Redirect to Facebook OAuth
 */
router.get(
  "/facebook",
  (req, res, next) => {
    const { memorizedLogin } = req.query;
    res.cookie("memorizedLogin", memorizedLogin);

    // If request is from Axios (AJAX), don't redirect and trigger CORS error
    if (
      req.xhr ||
      (req.headers.accept && req.headers.accept.includes("application/json"))
    ) {
      return res.json({ success: true, message: "Cookie set" });
    }
    next();
  },
  passport.authenticate("facebook", {
    scope: ["email"],
  }),
);

/**
 * @swagger
 * /api/auth/facebook/redirect:
 *   get:
 *     summary: Facebook OAuth callback
 *     tags:
 *       - Authentication
 *     responses:
 *       302:
 *         description: Redirect to client login status
 */
router.get(
  "/facebook/redirect",
  passport.authenticate("facebook", {
    successRedirect: `${process.env.CLIENT_URL}/login/status`,
    failureRedirect: `${process.env.CLIENT_URL}/login/status`,
  }),
);

/**
 * @swagger
 * /api/auth/login-status:
 *   get:
 *     summary: Check login status
 *     tags:
 *       - Authentication
 *     responses:
 *       200:
 *         description: Login status retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 loggedIn:
 *                   type: boolean
 *                 user:
 *                   $ref: '#/components/schemas/User'
 */
router.get("/login-status", authController.loginStatus);

/**
 * @swagger
 * /api/auth/send-otp:
 *   post:
 *     summary: Send OTP to email
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 example: user@example.com
 *     responses:
 *       200:
 *         description: OTP sent successfully
 *       400:
 *         description: Invalid email
 */
router.post("/send-otp", authController.sendOTP);

/**
 * @swagger
 * /api/auth/verify-otp:
 *   post:
 *     summary: Verify OTP
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *               otp:
 *                 type: string
 *     responses:
 *       200:
 *         description: OTP verified successfully
 *       400:
 *         description: Invalid OTP
 */
router.post("/verify-otp", authController.verifyOTP);

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: Refresh access token using refresh token
 *     tags:
 *       - Authentication
 */
router.post("/refresh", authController.refreshToken);

/**
 * @swagger
 * /api/auth/login-user:
 *   post:
 *     summary: Login user with email and password
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 token:
 *                   type: string
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         description: Invalid credentials
 */
router.post("/login-user", authController.loginUser);

/**
 * @swagger
 * /api/auth/register-user:
 *   post:
 *     summary: Register new user
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               name:
 *                 type: string
 *               phone:
 *                 type: string
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: Invalid input or user already exists
 */
router.post("/register-user", authController.registerUser);

/**
 * @swagger
 * /api/auth/logout-user:
 *   post:
 *     summary: Logout user
 *     tags:
 *       - Authentication
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Logout successful
 */
router.post("/logout-user", authController.logoutUser);

/**
 * @swagger
 * /api/auth/forgot-password/send-otp:
 *   post:
 *     summary: Send OTP for password reset
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *     responses:
 *       200:
 *         description: OTP sent successfully
 *       404:
 *         description: User not found
 */
router.post("/forgot-password/send-otp", authController.forgotPasswordSendOTP);

/**
 * @swagger
 * /api/auth/forgot-password/verify-otp:
 *   post:
 *     summary: Verify OTP for password reset
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *               otp:
 *                 type: string
 *     responses:
 *       200:
 *         description: OTP verified successfully
 *       400:
 *         description: Invalid OTP
 */
router.post(
  "/forgot-password/verify-otp",
  authController.forgotPasswordVerifyOTP,
);

/**
 * @swagger
 * /api/auth/forgot-password/reset-password:
 *   post:
 *     summary: Reset password
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *               otp:
 *                 type: string
 *               new_password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password reset successfully
 *       400:
 *         description: Invalid request
 */
router.post("/forgot-password/reset-password", authController.resetPassword);

module.exports = router;
