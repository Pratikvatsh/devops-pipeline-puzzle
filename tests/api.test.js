/**
 * End-to-end API tests. Run with: npm test
 * Uses the in-memory store, so no Supabase project is needed.
 */
process.env.USE_MEMORY_STORE = 'true';
process.env.LEADERBOARD_ENABLED = 'true';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server');
const { questionById } = require('../src/data/quizQuestions');

const CORRECT_ORDER = ['CODE', 'BUILD', 'TEST', 'PACKAGE', 'DEPLOY', 'MONITOR'];
let server;
let baseUrl;

async function call(method, path, body, rawBody) {
  const response = await fetch(baseUrl + path, {
    method,
    headers: body || rawBody ? { 'Content-Type': 'application/json' } : undefined,
    body: rawBody || (body ? JSON.stringify(body) : undefined)
  });
  const text = await response.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: response.status, data };
}

/** Finds the displayed letter of the correct answer (test-only: uses the server's bank). */
function correctLetterFor(question) {
  const bankQuestion = questionById.get(question.questionId);
  const correctText = bankQuestion.options.find((o) => o.id === bankQuestion.correctAnswer).text;
  return question.options.find((o) => o.text === correctText).id;
}

test.before(async () => {
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

test('health check', async () => {
  const { status, data } = await call('GET', '/api/health');
  assert.equal(status, 200);
  assert.equal(data.status, 'ok');
  assert.equal(data.service, 'devops-pipeline-puzzle');
});

test('frontend is served at / and unknown API routes return JSON 404', async () => {
  const home = await call('GET', '/');
  assert.equal(home.status, 200);
  assert.match(home.data, /DevOps Pipeline Puzzle/);
  const missing = await call('GET', '/api/nope');
  assert.equal(missing.status, 404);
  assert.ok(missing.data.error);
});

test('start game validates the player name', async () => {
  for (const playerName of [undefined, '', '    ', '!!!', 'x'.repeat(41), 42]) {
    const { status, data } = await call('POST', '/api/game/start', { playerName });
    assert.equal(status, 400, `expected 400 for ${JSON.stringify(playerName)}`);
    assert.ok(data.error);
  }
});

test('invalid JSON and unknown game ids are handled safely', async () => {
  const bad = await call('POST', '/api/game/start', null, '{"playerName": ');
  assert.equal(bad.status, 400);
  assert.equal(bad.data.error, 'The request body is not valid JSON.');

  const notUuid = await call('GET', '/api/game/not-a-real-id');
  assert.equal(notUuid.status, 404);
  const unknown = await call('GET', '/api/game/00000000-0000-4000-8000-000000000000');
  assert.equal(unknown.status, 404);
});

test('full game: pipeline, quiz, scoring, duplicates, finish, leaderboard', async () => {
  // Start
  const start = await call('POST', '/api/game/start', { playerName: '  Vatsh   Kumar ' });
  assert.equal(start.status, 201);
  assert.equal(start.data.playerName, 'Vatsh Kumar');
  assert.match(start.data.gameCode, /^GAME-[0-9A-F]{6}$/);
  assert.equal(start.data.pipeline.length, 6);
  assert.notDeepEqual(start.data.pipeline.map((s) => s.id), CORRECT_ORDER, 'pipeline must start shuffled');
  const id = start.data.gameId;

  // Quiz is locked until the pipeline is solved
  const early = await call('GET', `/api/game/${id}/question`);
  assert.equal(early.status, 409);

  // Invalid pipeline payloads
  for (const order of [undefined, 'CODE', CORRECT_ORDER.slice(0, 5), [...CORRECT_ORDER.slice(0, 5), 'CODE'], [...CORRECT_ORDER.slice(0, 5), 'HACK']]) {
    const res = await call('POST', `/api/game/${id}/pipeline`, { order });
    assert.equal(res.status, 400);
  }

  // Wrong order (attempt 1)
  const wrong = await call('POST', `/api/game/${id}/pipeline`, { order: ['BUILD', 'CODE', 'TEST', 'PACKAGE', 'DEPLOY', 'MONITOR'] });
  assert.equal(wrong.status, 200);
  assert.equal(wrong.data.correct, false);
  assert.equal(wrong.data.correctPositions, 4);
  assert.equal(wrong.data.nextAttemptScore, 15);
  assert.ok(wrong.data.hint);

  // Correct order on attempt 2 = 15 points; a score sent by the client is ignored
  const right = await call('POST', `/api/game/${id}/pipeline`, { order: CORRECT_ORDER, score: 80 });
  assert.equal(right.data.correct, true);
  assert.equal(right.data.pipelineScore, 15);
  assert.equal(right.data.nextStep, 'quiz');

  // Re-submitting does not change anything
  const again = await call('POST', `/api/game/${id}/pipeline`, { order: CORRECT_ORDER });
  assert.equal(again.data.alreadyCompleted, true);
  assert.equal(again.data.pipelineScore, 15);

  // Finishing early is refused
  const earlyFinish = await call('POST', `/api/game/${id}/finish`);
  assert.equal(earlyFinish.status, 409);

  // Quiz: 6 questions, answer #2 wrong, the rest right
  const seen = new Set();
  for (let n = 1; n <= 6; n += 1) {
    const q = await call('GET', `/api/game/${id}/question`);
    assert.equal(q.status, 200);
    assert.equal(q.data.questionNumber, n);
    assert.equal(q.data.totalQuestions, 6);
    assert.equal(q.data.options.length, 4);
    assert.ok(!('correctAnswer' in q.data), 'correct answer must not leak');
    assert.ok(!JSON.stringify(q.data).includes('explanation'), 'explanation must not leak');
    seen.add(q.data.questionId);

    const correctLetter = correctLetterFor(q.data);
    const letter = n === 2 ? ['A', 'B', 'C', 'D'].find((l) => l !== correctLetter) : correctLetter;

    if (n === 1) {
      const invalid = await call('POST', `/api/game/${id}/answer`, { questionId: q.data.questionId, answer: 'E' });
      assert.equal(invalid.status, 400);
      const foreign = await call('POST', `/api/game/${id}/answer`, { questionId: 'q999', answer: 'A' });
      assert.equal(foreign.status, 400);
    }

    const a = await call('POST', `/api/game/${id}/answer`, { questionId: q.data.questionId, answer: letter.toLowerCase() });
    assert.equal(a.status, 200);
    assert.equal(a.data.correct, n !== 2);
    assert.equal(a.data.scoreAwarded, n !== 2 ? 10 : 0);
    assert.equal(a.data.correctAnswer, correctLetter);
    assert.ok(a.data.explanation);
    assert.equal(a.data.isLastQuestion, n === 6);

    // Duplicate submission: no extra points
    const dup = await call('POST', `/api/game/${id}/answer`, { questionId: q.data.questionId, answer: correctLetter });
    assert.equal(dup.status, 200);
    assert.equal(dup.data.alreadyAnswered, true);
    assert.equal(dup.data.scoreAwarded, 0);
    assert.equal(dup.data.correct, n !== 2, 'duplicate returns the original result');
  }
  assert.equal(seen.size, 6, 'six different questions');

  const done = await call('GET', `/api/game/${id}/question`);
  assert.equal(done.data.done, true);

  // Snapshot (used after refresh) exposes no answers
  const snap = await call('GET', `/api/game/${id}`);
  assert.equal(snap.data.stage, 'quiz');
  assert.deepEqual(snap.data.quiz.results, [true, false, true, true, true, true]);
  assert.ok(!JSON.stringify(snap.data).includes('quiz_option_orders'));

  // Finish: 15 + 50 = 65 / 80 = 81.25%
  const finish = await call('POST', `/api/game/${id}/finish`);
  assert.equal(finish.status, 200);
  assert.equal(finish.data.playerName, 'Vatsh Kumar');
  assert.equal(finish.data.pipelineScore, 15);
  assert.equal(finish.data.quizCorrect, 5);
  assert.equal(finish.data.quizScore, 50);
  assert.equal(finish.data.totalScore, 65);
  assert.equal(finish.data.percentage, 81.25);
  assert.ok(finish.data.completedAt);

  // Finishing twice does not add points
  const finishAgain = await call('POST', `/api/game/${id}/finish`);
  assert.equal(finishAgain.data.totalScore, 65);
  assert.equal(finishAgain.data.alreadyFinished, true);

  // Leaderboard: completed game appears, unfinished game does not
  await call('POST', '/api/game/start', { playerName: 'Unfinished Player' });
  const board = await call('GET', '/api/leaderboard');
  assert.equal(board.status, 200);
  const names = board.data.entries.map((e) => e.name);
  assert.ok(names.includes('Vatsh Kumar'));
  assert.ok(!names.includes('Unfinished Player'));
  const entry = board.data.entries.find((e) => e.name === 'Vatsh Kumar');
  assert.deepEqual(Object.keys(entry).sort(), ['completedAt', 'name', 'percentage', 'rank', 'score']);
});

test('perfect game scores 80 and leaderboard is sorted by score', async () => {
  const start = await call('POST', '/api/game/start', { playerName: 'Perfect Pat' });
  const id = start.data.gameId;
  const right = await call('POST', `/api/game/${id}/pipeline`, { order: CORRECT_ORDER });
  assert.equal(right.data.pipelineScore, 20);
  let lastQuestionId;
  for (let n = 1; n <= 6; n += 1) {
    const q = await call('GET', `/api/game/${id}/question`);
    lastQuestionId = q.data.questionId;
    await call('POST', `/api/game/${id}/answer`, { questionId: q.data.questionId, answer: correctLetterFor(q.data) });
  }
  const finish = await call('POST', `/api/game/${id}/finish`);
  assert.equal(finish.data.totalScore, 80);
  assert.equal(finish.data.percentage, 100);

  const board = await call('GET', '/api/leaderboard');
  const scores = board.data.entries.map((e) => e.score);
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
  assert.equal(board.data.entries[0].name, 'Perfect Pat');

  // Answering again after finishing never adds points
  const late = await call('POST', `/api/game/${id}/answer`, { questionId: lastQuestionId, answer: 'A' });
  assert.equal(late.data.scoreAwarded, 0);
  const snap = await call('GET', `/api/game/${id}`);
  assert.equal(snap.data.totalScore, 80);
});

test('third and later pipeline attempts score 10', async () => {
  const start = await call('POST', '/api/game/start', { playerName: 'Third Try' });
  const id = start.data.gameId;
  const wrongOrder = ['MONITOR', 'BUILD', 'TEST', 'PACKAGE', 'DEPLOY', 'CODE'];
  await call('POST', `/api/game/${id}/pipeline`, { order: wrongOrder });
  await call('POST', `/api/game/${id}/pipeline`, { order: wrongOrder });
  await call('POST', `/api/game/${id}/pipeline`, { order: wrongOrder });
  const right = await call('POST', `/api/game/${id}/pipeline`, { order: CORRECT_ORDER });
  assert.equal(right.data.attempts, 4);
  assert.equal(right.data.pipelineScore, 10);
});

test('parallel duplicate answers only score once', async () => {
  const start = await call('POST', '/api/game/start', { playerName: 'Double Clicker' });
  const id = start.data.gameId;
  await call('POST', `/api/game/${id}/pipeline`, { order: CORRECT_ORDER });
  const q = await call('GET', `/api/game/${id}/question`);
  const letter = correctLetterFor(q.data);
  const results = await Promise.all(
    Array.from({ length: 5 }, () => call('POST', `/api/game/${id}/answer`, { questionId: q.data.questionId, answer: letter }))
  );
  const awarded = results.reduce((sum, r) => sum + (r.data.scoreAwarded || 0), 0);
  assert.equal(awarded, 10);
  const snap = await call('GET', `/api/game/${id}`);
  assert.equal(snap.data.quiz.score, 10);
  assert.equal(snap.data.quiz.answered, 1);
});
