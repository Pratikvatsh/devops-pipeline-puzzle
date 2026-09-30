const express = require('express');
const { asyncHandler } = require('../utils/httpError');
const controller = require('../controllers/gameController');

const router = express.Router();

router.get('/', asyncHandler(controller.getLeaderboard));

module.exports = router;
