require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const axios = require('axios');
const cors = require('cors');
const path = require('path');



const app = express();
app.use(cors());
app.use(bodyParser.json());

app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/payment/success', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/success.html'));
});


const PORT = process.env.PORT || 4000;
const MONGO = process.env.MONGO_URI;
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET;
const GODMODE_TOKEN = process.env.GODMODE_TOKEN;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// Mongo connection
//if (!MONGO) {
 // console.error("MONGO_URI not set in .env");
 // process.exit(1);
//}

// Your MongoDB connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ MongoDB connected successfully');
  } catch (err) {
    console.error('❌ MongoDB connection failed. Retrying in 5s...', err);
    setTimeout(connectDB, 5000); // retry after 5 seconds
  }
};

/*mongoose.connect(MONGO, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Mongo connected'))
  .catch(err => { console.error(err); process.exit(1); });*/

/* --- Models --- */
const productSchema = new mongoose.Schema({
  name: String,
  origin: String,
  price: Number,
  strikePrice: Number,
  discountQty: Number,
  discountPercent: Number,
  images: [String],
  stock: { type: Number, default: 9999 }
});

const orderSchema = new mongoose.Schema({
  items: [{
    productId: mongoose.Schema.Types.ObjectId,
    name: String,
    price: Number,
    quantity: Number
  }],
  total: Number,
  customer: {
    name: String,
    email: String,
    phone: String,
    approxPickupLocation: String
  },
  paystack: {
    reference: String,
    authorization_url: String,
    status: { type: String, default: "pending" },
    paid_at: Date
  },
  createdAt: { type: Date, default: Date.now }
});

const Product = mongoose.model('Product', productSchema);
const Order = mongoose.model('Order', orderSchema);

/* --- Routes --- */

app.get('/api/products', async (req, res) => {
  try {
    const products = await Product.find({});
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

app.post('/api/admin/seed', async (req, res) => {
  const token = req.headers['x-godmode'];
  if (token !== 'supersecrettoken123') return res.status(403).json({ message: 'Forbidden' });

  await Product.deleteMany({});
  const sample = [
    {
      name: 'Fresh Bananas',
      origin: 'Kenya',
      price: 100,
      strikePrice: 150,
      images: ['/images/scales.png']
    },
    {
      name: 'Premium Coffee',
      origin: 'Ethiopia',
      price: 500,
      strikePrice: 650,
      images: ['/images/birds-foot.png']
    }
  ];

  await Product.insertMany(sample);
  res.json({ message: 'Seeded successfully', count: sample.length });
});

// Define the seeding function
const seedProducts = async (retry = 0) => {
  try {
    const count = await Product.countDocuments();
    if (count > 0) {
      console.log(`ℹ️ Products already seeded (${count} items).`);
      return;
    }

    const products = [
      {
        name: 'Marryjane Crunchy Cookie',
        origin: 'Kenya',
        price: 50,
        strikePrice: 70,
        discountPercent: 10,
        discountQty: 10,
        images: ['/images/cruchy.png'],
      },
      {
        name: 'Birds-foot Cookies',
        origin: 'Ethiopia',
        price: 80,
        strikePrice: 120,
        discountPercent: 10,
        discountQty: 10,
        images: ['/images/birds-foot.png'],
      },
      {
        name: 'Wholesome Package',
        origin: 'Uganda',
        price: 1850,
        strikePrice: 2100,
        discountPercent: 10,
        discountQty: 5,
        images: ['/images/wholesome.png'],
      },
      {
        name: 'Spliffs',
        origin: 'Uganda',
        price: 50,
        strikePrice: 60,
        discountPercent: 10,
        discountQty: 10,
        images: ['/images/blants.png'],
      },
    ];

    await Product.insertMany(products);
    console.log(`✅ Seeded ${products.length} products successfully.`);
  } catch (err) {
    console.error(`❌ Seeding failed (attempt ${retry + 1}):`, err.message);

    // Retry logic — will retry up to 5 times, waiting 5s between tries
    if (retry < 5) {
      console.log('⏳ Retrying in 5 seconds...');
      setTimeout(() => seedProducts(retry + 1), 5000);
    } else {
      console.error('🚫 Failed to seed after multiple attempts.');
    }
  }
};

// Manual endpoint for reseeding if ever needed
app.get('/seed', async (req, res) => {
  try {
    await seedProducts();
    res.json({ message: 'Seeding triggered' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error seeding products' });
  }
});

app.post('/api/orders', async (req, res) => {
  try {
    const { items, customer } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'No items provided' });
    }

    const total = items.reduce((sum, i) => sum + (i.price * i.quantity), 0);

   
    const order = new Order({
      items,
      total,
      customer,
      paystack: { status: 'pending' },
      status: 'pending',
    });
    await order.save();

    // Initialize Paystack transaction
    const initResp = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: total * 100,
        email: customer.email || 'noemail@gmail.com',
        reference: order._id.toString().slice(-10),
        callback_url: `${process.env.BASE_URL}/success.html?ref=${order._id}`,
      }),
    });

    const initData = await initResp.json();

    if (!initData.status) {
      console.error('Paystack init error:', initData);
      return res.status(400).json({ error: 'Payment initialization failed' });
    }


    order.paystack.reference = initData.data.reference;
    order.paystack.authorization_url = initData.data.authorization_url;
    await order.save();

    res.json({
      authorization_url: initData.data.authorization_url,
      reference: initData.data.reference,
    });
  } catch (err) {
    console.error('Error creating order:', err);
    res.status(500).json({ error: 'Failed to create order' });
  }
});



// Paystack webhook

app.post('/api/paystack/webhook', async (req, res) => {
  const event = req.body;
  try {
    if (event.event === 'charge.success') {
      const data = event.data;
      const metadata = data.metadata || {};
      const orderId = metadata.orderId;

      const verifyUrl = `https://api.paystack.co/transaction/verify/${data.reference}`;
      const vResp = await axios.get(verifyUrl, { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } });
      if (vResp.data.status && vResp.data.data.status === 'success') {
        await Order.findByIdAndUpdate(orderId, {
          'paystack.status': 'paid',
          'paystack.paid_at': new Date()
        });
      }
    }
    res.json({ received: true });
  } catch (err) {
    console.error('Webhook error:', err.message);
    res.status(500).json({ ok: false });
  }
});

// Verify payment
app.get('/api/paystack/verify/:reference', async (req, res) => {
  try {
    const ref = req.params.reference;
    const verifyUrl = `https://api.paystack.co/transaction/verify/${ref}`;
    const vResp = await axios.get(verifyUrl, { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } });
    res.json(vResp.data);
  } catch (err) {
    res.status(500).json({ error: 'Verification failed' });
  }
});

// ✅ Fetch order by Paystack reference
app.get('/api/orders/reference/:ref', async (req, res) => {
  try {
    const order = await Order.findOne({ 'paystack.reference': req.params.ref });
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.json(order);
  } catch (err) {
    console.error('Error fetching order by reference:', err);
    res.status(500).json({ error: 'Server error' });
  }
});


// Get all orders (admin view)
app.get("/api/orders", async (req, res) => {
  try {
    const orders = await Order.find().sort({ _id: -1 });
    res.json(orders);
  } catch (err) {
    console.error("Error fetching orders:", err);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

// Update order status (mark as dispatched)
app.put("/api/orders/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    const updated = await Order.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    res.json(updated);
  } catch (err) {
    console.error("Error updating order status:", err);
    res.status(500).json({ error: "Failed to update status" });
  }
});

app.get('/admin', async (req, res) => {
  const god = req.headers['x-godmode'] || req.query.token;
  if (god !== GODMODE_TOKEN) return res.status(401).send('Unauthorized');

  const orders = await Order.find({}).sort({ createdAt: -1 }).lean();
  const rows = orders.map(o => {
    const items = o.items.map(i => `${i.name} x${i.quantity}`).join('<br>');
    // Status badge
    const status = o.paystack?.status || '';
    let statusClass = '';
    if(status.toLowerCase() === 'completed') statusClass = 'status-completed';
    else if(status.toLowerCase() === 'pending') statusClass = 'status-pending';
    else if(status.toLowerCase() === 'cancelled') statusClass = 'status-cancelled';

    return `<tr>
      <td>${o._id}</td>
      <td>${o.customer?.name || ''}<br>${o.customer?.email || ''}<br>${o.customer?.phone || ''}<br>${o.customer?.approxPickupLocation || ''}</td>
      <td>${items}</td>
      <td>${o.total}</td>
      <td>${o.paystack?.reference || ''}</td>
      <td><span class="${statusClass}">${status}</span></td>
      <td>${new Date(o.createdAt).toLocaleString()}</td>
    </tr>`;
  }).join('\n');

  res.send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Admin Orders</title>
<style>
  body {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    background: #f4f6f8;
    color: #1f2937;
    margin: 0;
    padding: 24px;
  }

  h1 {
    font-size: 28px;
    font-weight: 700;
    margin-bottom: 24px;
    color: #111827;
  }

  table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    background: #ffffff;
    box-shadow: 0 4px 12px rgba(0,0,0,0.08);
    border-radius: 8px;
    overflow: hidden;
  }

  thead {
    background: linear-gradient(90deg, #4f46e5, #6366f1);
    color: #ffffff;
  }

  th {
    padding: 14px 16px;
    text-align: left;
    font-weight: 600;
    font-size: 14px;
    letter-spacing: 0.5px;
  }

  tbody tr {
    border-bottom: 1px solid #e5e7eb;
    transition: background 0.2s ease;
  }

  tbody tr:hover {
    background: #f9fafb;
  }

  td {
    padding: 12px 16px;
    font-size: 14px;
    color: #374151;
    vertical-align: top;
  }

  /* Status badges */
  .status-pending { color: #b45309; background: #fef3c7; padding: 4px 10px; border-radius: 9999px; font-weight: 600; font-size: 12px; display:inline-block; }
  .status-completed { color: #047857; background: #d1fae5; padding: 4px 10px; border-radius: 9999px; font-weight: 600; font-size: 12px; display:inline-block; }
  .status-cancelled { color: #b91c1c; background: #fee2e2; padding: 4px 10px; border-radius: 9999px; font-weight: 600; font-size: 12px; display:inline-block; }

  /* Responsive table */
  @media(max-width: 768px){
    table, thead, tbody, th, td, tr {
      display: block;
      width: 100%;
    }

    thead tr {
      display: none;
    }

    tbody tr {
      margin-bottom: 16px;
      background: #ffffff;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.05);
      padding: 12px;
    }

    td {
      padding: 6px 12px;
      display: flex;
      justify-content: space-between;
      text-align: right;
      font-size: 13px;
      border: none;
    }

    td::before {
      content: attr(data-label);
      flex: 1;
      font-weight: 600;
      text-align: left;
      color: #6b7280;
    }
  }
</style>
</head>
<body>
<h1>Admin - Orders</h1>
<table>
<thead>
<tr>
  <th>Order ID</th>
  <th>Customer</th>
  <th>Items</th>
  <th>Total</th>
  <th>Reference</th>
  <th>Status</th>
  <th>Created</th>
</tr>
</thead>
<tbody>
${rows}
</tbody>
</table>
</body>
</html>`);
});


// Fallback to client
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Start server
//app.listen(PORT, () => console.log('Server listening on', PORT));

// Start server after DB connection
connectDB().then(() => {
  app.listen(PORT, async () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    await seedProducts(); // auto seed on launch
  });
});