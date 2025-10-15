// backend/controllers/paymentController.js
require('dotenv').config();
const axios = require('axios');
const Transaction = require('../models/Transaction');

// Create Paystack payment and transaction
exports.createPayment = async (req, res) => {
  try {
    const { email, cart } = req.body;

    if (!email || !cart || cart.length === 0)
      return res.status(400).json({ error: 'Email or cart missing' });

    // Calculate total amount in KES
    const totalAmountKES = cart.reduce((sum, item) => {
      const price = Number(item.price);
      if (isNaN(price)) throw new Error(`Invalid price for item: ${item.name}`);
      return sum + price;
    }, 0);

    // Convert to smallest unit for Paystack (KES * 100)
    const paystackAmount = totalAmountKES * 100;

    // Generate unique download token
    const downloadToken = Math.random().toString(36).substring(2, 12);

    //console.log("🔗 Callback URL sent to Paystack:", `https://niadevelopers.github.io/frontend/download.html?token=${downloadToken}`);


    // Initialize Paystack transaction
    const paystackResponse = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email,
        amount: paystackAmount, // 32 KES -> 3200
        currency: 'KES',
        callback_url: `https://niadevelopers.github.io/frontend/download.html?token=${downloadToken}`//tried manually modifying the call back route to prevent the base url returning a 404 error
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const reference = paystackResponse.data.data.reference;

    // Save transaction in DB (store amount in KES)
    await Transaction.create({
      email,
      cart,
      amount: totalAmountKES,
      paid: false,
      downloadToken,
      tokenExpiry: Date.now() + 5 * 60 * 1000,
      reference
    });

    // Send response to frontend (amount in KES for UI display)
    res.json({ reference, amount: totalAmountKES, downloadToken });

  } catch (err) {
    console.error('Paystack initialization error:', err.response?.data || err);
    res.status(500).json({ error: 'Failed to initialize Paystack transaction' });
  }
};

// Verify Paystack payment webhook
exports.verifyPayment = async (req, res) => {
  try {
    const { reference } = req.body;
    if (!reference) return res.status(400).json({ error: 'Reference missing' });

    const transaction = await Transaction.findOne({ reference });
    if (!transaction) return res.status(404).json({ error: 'Transaction not found' });

    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
      }
    );

    if (response.data.data.status === 'success') {
      transaction.paid = true;
      await transaction.save();
      return res.json({ success: true });
    } else {
      return res.status(400).json({ error: 'Payment not successful' });
    }

  } catch (err) {
    console.error('Paystack verification error:', err.response?.data || err);
    res.status(500).json({ error: 'Failed to verify payment' });
  }
};




