const express = require('express');
const router = express.Router();
const { createPayment, verifyPayment } = require('../controllers/paymentController');

router.post('/create', createPayment);
router.post('/verify', verifyPayment);

module.exports = router;
