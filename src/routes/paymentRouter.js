const paymentController = require('./../controllers/paymentController');
const express = require('express');
const {
    authMiddleware,
    authAdminMiddleware,
} = require('@core/middlewares/authMiddleware');

const router = express.Router();

router.post('/', authMiddleware, paymentController.createPaymentSession);
router.get(
    '/pending',
    authAdminMiddleware,
    paymentController.getPendingPayments,
);
router.get('/:id/status', authMiddleware, paymentController.getPaymentStatus);
router.post(
    '/:id/confirm',
    authAdminMiddleware,
    paymentController.confirmPayment,
);

module.exports = router;
