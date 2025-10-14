const Transaction = require('../models/Transaction');
const axios = require('axios');
const JSZip = require('jszip');

exports.downloadFiles = async (req, res) => {
  try {
    const { token } = req.params;
    const transaction = await Transaction.findOne({ downloadToken: token }).populate('products');

    if (!transaction || !transaction.paid || transaction.expiresAt < new Date()) {
      return res.status(403).json({ message: 'Invalid or expired token' });
    }

    // ZIP PDFs and TXTs
    const zip = new JSZip();
    for (const product of transaction.products) {
      if (['pdf','txt'].includes(product.type)) {
        const fileResponse = await axios.get(product.fileUrl, { responseType: 'arraybuffer' });
        zip.file(product.title + '.' + product.type, fileResponse.data);
      }
    }

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

    res.set('Content-Type', 'application/zip');
    res.set('Content-Disposition', `attachment; filename=downloads.zip`);
    res.send(zipBuffer);

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
