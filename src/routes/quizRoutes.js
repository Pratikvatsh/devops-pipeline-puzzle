const express = require('express');
const { asyncHandler } = require('../utils/httpError');
const controller = require('../controllers/gameController');

const router = express.Router();

router.get('/:gameId/question', asyncHandler(controller.getCurrentQuestion));
router.post('/:gameId/answer', asyncHandler(controller.submitAnswer));

module.exports = router;
