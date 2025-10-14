const express = require('express');
const router = express.Router();
const { downloadFiles } = require('../controllers/downloadController');

router.get('/:token', downloadFiles);

module.exports = router;
