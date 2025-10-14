// backend/models/Transaction.js
const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    email: { type: String, required: true },
    cart: { type: Array, required: true }, // [{id, name, price}]
    amount: { type: Number, required: true }, // amount in KES
    paid: { type: Boolean, default: false },
    downloadToken: { type: String, required: true },
    tokenExpiry: { type: Date, required: true },
    reference: { type: String, required: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Transaction', transactionSchema);
