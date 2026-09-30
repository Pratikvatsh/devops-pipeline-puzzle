const express = require('express');
const { asyncHandler } = require('../utils/httpError');
const controller = require('../controllers/gameController');

const router = express.Router();

router.post('/start', asyncHandler(controller.startGame));
router.get('/:gameId', asyncHandler(controller.getGame));
router.post('/:gameId/pipeline', asyncHandler(controller.submitPipeline));
router.post('/:gameId/finish', asyncHandler(controller.finishGame));

module.exports = router;
