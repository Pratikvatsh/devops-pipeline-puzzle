/**
 * Game controller.
 *
 * The server owns every rule that matters: it shuffles, validates the pipeline,
 * checks quiz answers and calculates all scores. The browser only ever sends
 * a name, a stage order, or a chosen option letter. Never a score.
 */
const config = require('../config');
const store = require('../db/gameStore');
const { HttpError } = require('../utils/httpError');
const { shuffle, createGameCode } = require('../utils/random');
const { PIPELINE_STAGES, CORRECT_PIPELINE_ORDER, POSITION_HINTS, stageById, toStageView } = require('../data/pipelineStages');
const { QUIZ_QUESTIONS, questionById } = require('../data/quizQuestions');

const OPTION_LETTERS = ['A', 'B', 'C', 'D'];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------- Helpers ----------

/** Trims, collapses whitespace and strips control characters from a player name. */
function normalisePlayerName(rawName) {
  if (typeof rawName !== 'string') return '';
  return rawName
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function validatePlayerName(name) {
  if (!name) return 'Please enter your name to start.';
  if (name.length > config.maxNameLength) return `Please keep your name under ${config.maxNameLength} characters.`;
  if (!/[\p{L}\p{N}]/u.test(name)) return 'Your name needs at least one letter or number.';
  return null;
}

/** Shuffles the stages, making sure the puzzle never starts already solved. */
function createShuffledPipeline() {
  let order;
  do {
    order = shuffle(CORRECT_PIPELINE_ORDER);
  } while (order.every((stageId, index) => stageId === CORRECT_PIPELINE_ORDER[index]));
  return order;
}

/** Picks random questions, preferring one question per category for variety. */
function pickQuizQuestions(count) {
  const shuffled = shuffle(QUIZ_QUESTIONS);
  const picked = [];
  const usedCategories = new Set();
  for (const question of shuffled) {
    if (picked.length === count) break;
    if (!usedCategories.has(question.category)) {
      picked.push(question);
      usedCategories.add(question.category);
    }
  }
  for (const question of shuffled) {
    if (picked.length === count) break;
    if (!picked.includes(question)) picked.push(question);
  }
  return picked;
}

async function loadGame(gameId) {
  if (typeof gameId !== 'string' || !UUID_PATTERN.test(gameId)) {
    throw new HttpError(404, 'Game not found. Please start a new game.');
  }
  const game = await store.findGame(gameId);
  if (!game) throw new HttpError(404, 'Game not found. Please start a new game.');
  return game;
}

function roundPercentage(totalScore) {
  return Math.round((totalScore / config.maxTotalScore) * 10000) / 100;
}

/** Player-safe snapshot of a game (no answers, no option mappings). */
function toPublicGame(game) {
  const answers = game.quiz_answers || {};
  const answeredIds = game.quiz_question_ids.slice(0, game.current_question_index);
  return {
    gameId: game.id,
    gameCode: game.game_code,
    playerName: game.player_name,
    stage: game.current_stage,
    completed: game.completed,
    pipeline: {
      stages: game.pipeline_initial_order.map(toStageView),
      attempts: game.pipeline_attempts,
      correct: game.pipeline_correct,
      score: game.pipeline_score,
      maxScore: config.maxPipelineScore,
      nextAttemptScore: config.pipelineScoreForAttempt(game.pipeline_attempts + 1)
    },
    quiz: {
      answered: game.current_question_index,
      totalQuestions: game.quiz_question_ids.length,
      score: game.quiz_score,
      correctCount: game.quiz_correct_count,
      maxScore: config.maxQuizScore,
      results: answeredIds.map((questionId) => Boolean(answers[questionId] && answers[questionId].correct))
    },
    totalScore: game.total_score,
    maxScore: config.maxTotalScore,
    startedAt: game.started_at,
    completedAt: game.completed_at
  };
}

function completionMessage(percentage) {
  if (percentage >= 90) return 'Outstanding run. You shipped the pipeline like a seasoned DevOps engineer.';
  if (percentage >= 75) return 'You successfully completed the DevOps mission.';
  if (percentage >= 50) return 'Mission complete. A quick look back at the explanations will make your next run even smoother.';
  return 'Mission complete. Every engineer starts somewhere. Play again to lock in the concepts.';
}

function toResults(game) {
  const percentage = Number(game.percentage);
  return {
    gameCode: game.game_code,
    playerName: game.player_name,
    pipelineCorrect: game.pipeline_correct,
    pipelineAttempts: game.pipeline_attempts,
    pipelineScore: game.pipeline_score,
    maxPipelineScore: config.maxPipelineScore,
    quizCorrect: game.quiz_correct_count,
    totalQuestions: game.quiz_question_ids.length,
    quizScore: game.quiz_score,
    maxQuizScore: config.maxQuizScore,
    totalScore: game.total_score,
    maxScore: config.maxTotalScore,
    percentage,
    achievement: 'Pipeline shipped',
    message: completionMessage(percentage),
    startedAt: game.started_at,
    completedAt: game.completed_at
  };
}

/** Builds the answer response for a question that has already been scored. */
function answerResponse(game, question, storedAnswer, extra = {}) {
  const optionOrder = game.quiz_option_orders[question.id];
  const questionNumber = game.quiz_question_ids.indexOf(question.id) + 1;
  const totalQuestions = game.quiz_question_ids.length;
  return {
    questionId: question.id,
    selectedAnswer: storedAnswer.answer,
    correct: storedAnswer.correct,
    correctAnswer: OPTION_LETTERS[optionOrder.indexOf(question.correctAnswer)],
    explanation: question.explanation,
    quizScore: game.quiz_score,
    questionNumber,
    totalQuestions,
    isLastQuestion: questionNumber === totalQuestions,
    ...extra
  };
}

// ---------- Route handlers ----------

/** POST /api/game/start */
async function startGame(req, res) {
  const playerName = normalisePlayerName(req.body && req.body.playerName);
  const nameError = validatePlayerName(playerName);
  if (nameError) throw new HttpError(400, nameError);

  const questions = pickQuizQuestions(config.questionsPerGame);
  const optionOrders = {};
  for (const question of questions) {
    optionOrders[question.id] = shuffle(question.options.map((option) => option.id));
  }

  const game = await store.createGame({
    game_code: createGameCode(),
    player_name: playerName,
    pipeline_initial_order: createShuffledPipeline(),
    pipeline_attempts: 0,
    pipeline_correct: false,
    pipeline_score: 0,
    quiz_question_ids: questions.map((question) => question.id),
    quiz_option_orders: optionOrders,
    quiz_answers: {},
    current_question_index: 0,
    quiz_score: 0,
    quiz_correct_count: 0,
    total_score: 0,
    percentage: 0,
    current_stage: 'pipeline',
    completed: false
  });

  res.status(201).json({
    gameId: game.id,
    gameCode: game.game_code,
    playerName: game.player_name,
    message: 'Game started',
    pipeline: game.pipeline_initial_order.map(toStageView),
    totalQuestions: game.quiz_question_ids.length,
    maxScore: config.maxTotalScore,
    nextAttemptScore: config.pipelineScoreForAttempt(1)
  });
}

/** GET /api/game/:gameId */
async function getGame(req, res) {
  const game = await loadGame(req.params.gameId);
  res.json(toPublicGame(game));
}

/** POST /api/game/:gameId/pipeline */
async function submitPipeline(req, res) {
  const game = await loadGame(req.params.gameId);
  if (game.completed) throw new HttpError(409, 'This game is already finished. Start a new game to play again.');

  // Idempotent: a repeated submit after success simply confirms it.
  if (game.pipeline_correct) {
    return res.json({
      correct: true,
      alreadyCompleted: true,
      message: 'Pipeline already assembled.',
      nextStep: 'quiz',
      attempts: game.pipeline_attempts,
      pipelineScore: game.pipeline_score,
      maxPipelineScore: config.maxPipelineScore
    });
  }

  const order = req.body && req.body.order;
  const validIds = new Set(PIPELINE_STAGES.map((stage) => stage.id));
  const isValidOrder =
    Array.isArray(order) &&
    order.length === CORRECT_PIPELINE_ORDER.length &&
    order.every((stageId) => typeof stageId === 'string' && validIds.has(stageId)) &&
    new Set(order).size === CORRECT_PIPELINE_ORDER.length;
  if (!isValidOrder) {
    throw new HttpError(400, 'Send all six pipeline stages exactly once.');
  }

  const attempts = game.pipeline_attempts + 1;
  const firstWrongIndex = order.findIndex((stageId, index) => stageId !== CORRECT_PIPELINE_ORDER[index]);
  const correct = firstWrongIndex === -1;
  const pipelineScore = correct ? config.pipelineScoreForAttempt(attempts) : 0;

  const patch = correct
    ? { pipeline_attempts: attempts, pipeline_correct: true, pipeline_score: pipelineScore, current_stage: 'quiz' }
    : { pipeline_attempts: attempts };

  const updated = await store.updateGame(game.id, patch, {
    pipeline_attempts: game.pipeline_attempts,
    pipeline_correct: false
  });
  if (!updated) {
    throw new HttpError(409, 'Your pipeline was already submitted from another tab. Refresh to continue.');
  }

  if (correct) {
    return res.json({
      correct: true,
      message: 'Pipeline assembled successfully.',
      nextStep: 'quiz',
      attempts,
      pipelineScore,
      maxPipelineScore: config.maxPipelineScore
    });
  }

  const correctPositions = order.filter((stageId, index) => stageId === CORRECT_PIPELINE_ORDER[index]).length;
  return res.json({
    correct: false,
    message: 'The pipeline order is not correct yet.',
    hint: POSITION_HINTS[firstWrongIndex],
    correctPositions,
    totalStages: CORRECT_PIPELINE_ORDER.length,
    attempts,
    nextAttemptScore: config.pipelineScoreForAttempt(attempts + 1)
  });
}

/** GET /api/game/:gameId/question */
async function getCurrentQuestion(req, res) {
  const game = await loadGame(req.params.gameId);
  if (!game.pipeline_correct) throw new HttpError(409, 'Finish the pipeline puzzle before starting the quiz.');

  const totalQuestions = game.quiz_question_ids.length;
  if (game.completed || game.current_question_index >= totalQuestions) {
    return res.json({ done: true, totalQuestions, answered: game.current_question_index });
  }

  const question = questionById.get(game.quiz_question_ids[game.current_question_index]);
  const optionOrder = game.quiz_option_orders[question.id];
  const options = optionOrder.map((originalId, index) => ({
    id: OPTION_LETTERS[index],
    text: question.options.find((option) => option.id === originalId).text
  }));

  res.json({
    done: false,
    questionId: question.id,
    questionNumber: game.current_question_index + 1,
    totalQuestions,
    category: question.category,
    question: question.question,
    options,
    quizScore: game.quiz_score
  });
}

/** POST /api/game/:gameId/answer */
async function submitAnswer(req, res) {
  const game = await loadGame(req.params.gameId);
  const questionId = req.body && req.body.questionId;
  const answer = typeof (req.body && req.body.answer) === 'string' ? req.body.answer.trim().toUpperCase() : '';

  if (typeof questionId !== 'string' || !game.quiz_question_ids.includes(questionId)) {
    throw new HttpError(400, 'That question is not part of this game.');
  }
  if (!OPTION_LETTERS.includes(answer)) {
    throw new HttpError(400, 'Choose one of the options A, B, C or D.');
  }
  if (!game.pipeline_correct) throw new HttpError(409, 'Finish the pipeline puzzle before starting the quiz.');

  const question = questionById.get(questionId);
  const answers = game.quiz_answers || {};

  // Duplicate submission: report the original result, award nothing new.
  if (answers[questionId]) {
    return res.json(answerResponse(game, question, answers[questionId], { alreadyAnswered: true, scoreAwarded: 0 }));
  }
  if (game.completed) throw new HttpError(409, 'This game is already finished.');

  const currentQuestionId = game.quiz_question_ids[game.current_question_index];
  if (questionId !== currentQuestionId) {
    throw new HttpError(409, 'Please answer the current question first.');
  }

  const optionOrder = game.quiz_option_orders[questionId];
  const chosenOriginalId = optionOrder[OPTION_LETTERS.indexOf(answer)];
  const correct = chosenOriginalId === question.correctAnswer;
  const scoreAwarded = correct ? config.pointsPerQuestion : 0;
  const storedAnswer = { answer, correct, awarded: scoreAwarded, answeredAt: new Date().toISOString() };

  const updated = await store.updateGame(
    game.id,
    {
      quiz_answers: { ...answers, [questionId]: storedAnswer },
      current_question_index: game.current_question_index + 1,
      quiz_score: game.quiz_score + scoreAwarded,
      quiz_correct_count: game.quiz_correct_count + (correct ? 1 : 0)
    },
    { current_question_index: game.current_question_index, completed: false }
  );

  if (!updated) {
    // Lost a race with a parallel request: return whatever was stored first.
    const latest = await loadGame(game.id);
    const latestAnswer = (latest.quiz_answers || {})[questionId];
    if (latestAnswer) {
      return res.json(answerResponse(latest, question, latestAnswer, { alreadyAnswered: true, scoreAwarded: 0 }));
    }
    throw new HttpError(409, 'Your answer could not be saved. Please try again.');
  }

  res.json(answerResponse(updated, question, storedAnswer, { scoreAwarded }));
}

/** POST /api/game/:gameId/finish */
async function finishGame(req, res) {
  const game = await loadGame(req.params.gameId);

  // Idempotent: finishing twice returns the same stored result.
  if (game.completed) return res.json({ ...toResults(game), alreadyFinished: true });

  const totalQuestions = game.quiz_question_ids.length;
  if (!game.pipeline_correct || game.current_question_index < totalQuestions) {
    throw new HttpError(409, `Answer all ${totalQuestions} questions before finishing.`);
  }

  // Recalculate from the stored answers so the result is always consistent.
  const storedAnswers = Object.values(game.quiz_answers || {});
  const quizCorrect = storedAnswers.filter((stored) => stored.correct).length;
  const quizScore = quizCorrect * config.pointsPerQuestion;
  const totalScore = game.pipeline_score + quizScore;

  const updated = await store.updateGame(
    game.id,
    {
      quiz_correct_count: quizCorrect,
      quiz_score: quizScore,
      total_score: totalScore,
      percentage: roundPercentage(totalScore),
      current_stage: 'finished',
      completed: true,
      completed_at: new Date().toISOString()
    },
    { completed: false }
  );

  const finalGame = updated || (await loadGame(game.id));
  res.json(toResults(finalGame));
}

/** GET /api/leaderboard */
async function getLeaderboard(req, res) {
  if (!config.leaderboardEnabled) {
    throw new HttpError(404, 'The leaderboard is turned off for this event.', { enabled: false });
  }
  const requested = Number.parseInt(req.query.limit, 10);
  const limit = Number.isInteger(requested) && requested > 0 ? Math.min(requested, 50) : config.leaderboardLimit;

  const rows = await store.listLeaderboard(limit);
  res.json({
    enabled: true,
    note: 'Scores are from completed game sessions.',
    maxScore: config.maxTotalScore,
    entries: rows.map((row, index) => ({
      rank: index + 1,
      name: row.player_name,
      score: row.total_score,
      percentage: Number(row.percentage),
      completedAt: row.completed_at
    }))
  });
}

module.exports = {
  startGame,
  getGame,
  submitPipeline,
  getCurrentQuestion,
  submitAnswer,
  finishGame,
  getLeaderboard,
  // exported for tests
  _internal: { normalisePlayerName, validatePlayerName, pickQuizQuestions, createShuffledPipeline, stageById }
};
