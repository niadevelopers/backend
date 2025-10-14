const Admin = require('../models/Admin');
const jwt = require('jsonwebtoken');

const generateToken = (admin) => {
  return jwt.sign({ id: admin._id, email: admin.email }, process.env.JWT_SECRET || 'secretkey', { expiresIn: '7d' });
};

exports.registerAdmin = async (req, res) => {
  try {
    const existingAdmin = await Admin.findOne({});
    if (existingAdmin) return res.status(400).json({ message: 'Admin already exists' });

    const { email, password } = req.body;
    const admin = await Admin.create({ email, password });
    const token = generateToken(admin);
    res.json({ token, admin: { email: admin.email, id: admin._id } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;
    const admin = await Admin.findOne({ email });
    if (!admin || !(await admin.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    const token = generateToken(admin);
    res.json({ token, admin: { email: admin.email, id: admin._id } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
