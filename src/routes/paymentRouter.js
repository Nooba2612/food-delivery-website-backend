const paymentController = require('@controllers/paymentController');
const express = require('express');
const {
    authMiddleware,
    authAdminMiddleware,
} = require('@middlewares/authMiddleware');

const router = express.Router();

router.post('/', authMiddleware, paymentController.createPaymentSession);
router.get(
    '/pending',
    authAdminMiddleware,
    paymentController.getPendingPayments,
);
router.post(
    '/:id/confirm',
    authAdminMiddleware,
    paymentController.confirmPayment,
);

module.exports = router;
