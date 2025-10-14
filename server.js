const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
require('dotenv').config();

const app = express();

// ✅ CORS configuration for GitHub Pages
app.use(cors({
  origin: ['https://niadevelopers.github.io'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// Middleware
app.use(express.json());

// Connect DB
connectDB();

// Routes
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/products', require('./routes/productRoutes'));
app.use('/api/payment', require('./routes/paymentRoutes'));
app.use('/api/download', require('./routes/downloadRoutes'));

// Start Server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
