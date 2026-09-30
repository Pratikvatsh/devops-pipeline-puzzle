/* ==========================================================
   DevOps Pipeline Puzzle: frontend
   Plain JavaScript. The server validates everything and
   calculates every score; this file only shows the game.
   ========================================================== */
'use strict';

const SESSION_KEY = 'dpp.session.v1';
const REQUEST_TIMEOUT_MS = 15000;

/* ---------- Stage icons (inline SVG, no external requests) ---------- */

const svg = (paths) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

const STAGE_ICONS = {
  CODE: svg('<polyline points="8 6 2 12 8 18"/><polyline points="16 6 22 12 16 18"/><line x1="13.5" y1="4" x2="10.5" y2="20"/>'),
  BUILD: svg('<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>'),
  TEST: svg('<circle cx="12" cy="12" r="9"/><polyline points="8 12.5 11 15.5 16.5 9.5"/>'),
  PACKAGE: svg('<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>'),
  DEPLOY: svg('<path d="M12 2.5c3 2.2 4.8 5.8 4.6 9.8L14.5 16h-5l-2.1-3.7C7.2 8.3 9 4.7 12 2.5z"/><circle cx="12" cy="9.5" r="1.8"/><path d="M9.5 16 7 20.5l3.2-1.2M14.5 16l2.5 4.5-3.2-1.2"/>'),
  MONITOR: svg('<path d="M3 3v18h18"/><polyline points="7 15 11 10.5 14 13.5 20 7"/>')
};
const HERO_STAGE_ORDER = ['CODE', 'BUILD', 'TEST', 'PACKAGE', 'DEPLOY', 'MONITOR'];

/* ---------- State ---------- */

const state = {
  screen: null,
  busy: false,
  leaderboardEnabled: true,

  gameId: null,
  gameCode: null,
  playerName: '',

  initialStages: [], // shuffled order received from the server
  stages: [], // current arrangement on screen
  selectedIndex: null,
  pipelineAttempts: 0,
  pipelineScore: 0,
  pipelineComplete: false,
  nextAttemptScore: 20,

  totalQuestions: 6,
  currentQuestion: null,
  lastAnswer: null,
  quizScore: 0,
  quizResults: [], // true/false per answered question

  results: null,
  leaderboardReturn: 'start'
};

/* ---------- DOM helpers ---------- */

const $ = (id) => document.getElementById(id);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Session storage (survives refresh, not a new tab) ---------- */

function saveSession() {
  try {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ gameId: state.gameId, order: state.stages.map((stage) => stage.id) })
    );
  } catch (err) {
    /* storage unavailable: the game still works, just not across refreshes */
  }
}

function loadSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
  } catch (err) {
    return null;
  }
}

function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch (err) {
    /* ignore */
  }
}

/* ---------- API ---------- */

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function apiRequest(path, { method = 'GET', body } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      cache: 'no-store'
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new ApiError('The server took too long to respond. Check your connection and try again.', 0);
    }
    throw new ApiError('Can’t reach the game server. Check your connection and try again.', 0);
  } finally {
    clearTimeout(timer);
  }

  let data = null;
  try {
    data = await response.json();
  } catch (err) {
    data = null;
  }

  if (!response.ok) {
    const fallback =
      response.status >= 500
        ? 'Something went wrong on the server. Please try again.'
        : 'That request could not be completed. Please try again.';
    throw new ApiError((data && data.error) || fallback, response.status, data);
  }
  return data;
}

const api = {
  health: () => apiRequest('/api/health'),
  startGame: (playerName) => apiRequest('/api/game/start', { method: 'POST', body: { playerName } }),
  getGame: (gameId) => apiRequest(`/api/game/${encodeURIComponent(gameId)}`),
  submitPipeline: (gameId, order) =>
    apiRequest(`/api/game/${encodeURIComponent(gameId)}/pipeline`, { method: 'POST', body: { order } }),
  getQuestion: (gameId) => apiRequest(`/api/game/${encodeURIComponent(gameId)}/question`),
  submitAnswer: (gameId, questionId, answer) =>
    apiRequest(`/api/game/${encodeURIComponent(gameId)}/answer`, { method: 'POST', body: { questionId, answer } }),
  finish: (gameId) => apiRequest(`/api/game/${encodeURIComponent(gameId)}/finish`, { method: 'POST' }),
  leaderboard: () => apiRequest('/api/leaderboard')
};

/* ---------- Feedback helpers ---------- */

let toastTimer = null;

function showToast(message, type = 'error') {
  const toast = $('toast');
  $('toast-text').textContent = message;
  toast.classList.toggle('is-info', type === 'info');
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, 7000);
}

function hideToast() {
  $('toast').hidden = true;
}

/** Puts a button into a loading state and returns a function that restores it. */
function setButtonLoading(button, label) {
  const original = button.textContent;
  button.disabled = true;
  button.classList.add('is-loading');
  button.setAttribute('aria-busy', 'true');
  button.textContent = label;
  return () => {
    button.disabled = false;
    button.classList.remove('is-loading');
    button.removeAttribute('aria-busy');
    button.textContent = original;
  };
}

/** Counts a number up or down for score displays. */
function animateNumber(node, from, to, { duration = 600, decimals = 0, suffix = '' } = {}) {
  const format = (value) => `${Number(value.toFixed(decimals))}${suffix}`;
  if (prefersReducedMotion() || from === to) {
    node.textContent = format(to);
    return;
  }
  const start = performance.now();
  const step = (now) => {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    node.textContent = format(from + (to - from) * eased);
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** Central handling for failed API calls. */
function handleApiError(err) {
  if (err.status === 404 && state.gameId) {
    clearSession();
    resetGameState();
    showScreen('start');
    showToast('We couldn’t find your game. Please start a new one.');
    return;
  }
  if (err.status === 409 && state.gameId) {
    showToast(err.message, 'info');
    resumeGame(state.gameId);
    return;
  }
  showToast(err.message || 'Something went wrong. Please try again.');
}

/* ---------- Screens + HUD ---------- */

function showScreen(name, { focus = true } = {}) {
  document.querySelectorAll('.screen').forEach((screen) => {
    const active = screen.dataset.screen === name;
    screen.hidden = !active;
    screen.classList.toggle('is-active', active);
  });
  state.screen = name;
  $('hud').hidden = !['pipeline', 'quiz'].includes(name);
  updateHud();
  window.scrollTo(0, 0);
  if (focus) {
    const heading = document.querySelector(`[data-screen="${name}"] [tabindex="-1"]`);
    if (heading) heading.focus({ preventScroll: true });
  }
}

function buildHudRail() {
  const rail = $('hud-rail');
  rail.innerHTML = '';
  for (let i = 0; i < 6; i += 1) rail.appendChild(el('span', 'rail-dot pipeline-dot'));
  rail.appendChild(el('span', 'rail-gap'));
  for (let i = 0; i < state.totalQuestions; i += 1) rail.appendChild(el('span', 'rail-dot quiz-dot'));
}

function updateHud() {
  const onQuiz = state.screen === 'quiz';
  $('hud-step').textContent = onQuiz ? 'Mission 2 of 2' : 'Mission 1 of 2';
  $('hud-title').textContent = onQuiz ? 'Knowledge check' : 'Build the pipeline';

  document.querySelectorAll('.pipeline-dot').forEach((dot) => {
    dot.classList.toggle('is-done', state.pipelineComplete);
  });
  const currentIndex = state.currentQuestion ? state.currentQuestion.questionNumber - 1 : -1;
  document.querySelectorAll('.quiz-dot').forEach((dot, index) => {
    const result = state.quizResults[index];
    dot.className = 'rail-dot quiz-dot';
    if (result === true) dot.classList.add('is-correct');
    else if (result === false) dot.classList.add('is-wrong');
    else if (onQuiz && index === currentIndex) dot.classList.add('is-current');
  });
}

function updateScore(previousTotal) {
  const total = state.pipelineScore + state.quizScore;
  const badge = document.querySelector('.score-badge');
  animateNumber($('score-value'), previousTotal, total, { duration: 500 });
  if (total !== previousTotal && !prefersReducedMotion()) {
    badge.classList.remove('is-bump');
    void badge.offsetWidth; // restart the animation
    badge.classList.add('is-bump');
  }
}

function renderHeroRail() {
  const rail = $('hero-rail');
  rail.innerHTML = '';
  HERO_STAGE_ORDER.forEach((stageId, index) => {
    const node = el('span', 'rail-node');
    node.style.setProperty('--i', index);
    node.innerHTML = STAGE_ICONS[stageId];
    rail.appendChild(node);
  });
}

/* ---------- Game state ---------- */

function resetGameState() {
  Object.assign(state, {
    gameId: null,
    gameCode: null,
    initialStages: [],
    stages: [],
    selectedIndex: null,
    pipelineAttempts: 0,
    pipelineScore: 0,
    pipelineComplete: false,
    nextAttemptScore: 20,
    currentQuestion: null,
    lastAnswer: null,
    quizScore: 0,
    quizResults: [],
    results: null
  });
  $('score-value').textContent = '0';
}

/** Applies a game snapshot from GET /api/game/:id (used after refresh). */
function applyGameSnapshot(game, savedOrder) {
  state.gameId = game.gameId;
  state.gameCode = game.gameCode;
  state.playerName = game.playerName;
  state.initialStages = game.pipeline.stages;
  state.pipelineAttempts = game.pipeline.attempts;
  state.pipelineScore = game.pipeline.score;
  state.pipelineComplete = game.pipeline.correct;
  state.nextAttemptScore = game.pipeline.nextAttemptScore;
  state.totalQuestions = game.quiz.totalQuestions;
  state.quizScore = game.quiz.score;
  state.quizResults = game.quiz.results;

  const byId = new Map(game.pipeline.stages.map((stage) => [stage.id, stage]));
  const validSaved =
    Array.isArray(savedOrder) &&
    savedOrder.length === byId.size &&
    new Set(savedOrder).size === byId.size &&
    savedOrder.every((id) => byId.has(id));
  state.stages = validSaved ? savedOrder.map((id) => byId.get(id)) : [...game.pipeline.stages];

  buildHudRail();
  $('score-value').textContent = String(state.pipelineScore + state.quizScore);
}

async function resumeGame(gameId, savedOrder) {
  showScreen('loading', { focus: false });
  try {
    const game = await api.getGame(gameId);
    applyGameSnapshot(game, savedOrder || (loadSession() || {}).order);
    saveSession();

    if (game.stage === 'finished') {
      await finishGame();
    } else if (game.stage === 'quiz') {
      showScreen('quiz');
      await loadQuestion();
    } else {
      renderPipeline();
      renderPipelineStatus();
      showScreen('pipeline');
    }
  } catch (err) {
    clearSession();
    resetGameState();
    showScreen('start', { focus: false });
    showToast(
      err.status === 404
        ? 'Your previous game could not be found. Start a new one whenever you’re ready.'
        : err.message
    );
  }
}

/* ---------- 1. Start ---------- */

function normaliseName(value) {
  return value.replace(/[\u0000-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim();
}

function validateName(name) {
  if (!name) return 'Please enter your name to start.';
  if (name.length > 40) return 'Please keep your name under 40 characters.';
  if (!/[\p{L}\p{N}]/u.test(name)) return 'Your name needs at least one letter or number.';
  return null;
}

function setNameError(message) {
  const error = $('name-error');
  const input = $('player-name');
  error.textContent = message || '';
  error.hidden = !message;
  input.setAttribute('aria-invalid', message ? 'true' : 'false');
}

async function handleStart(event) {
  event.preventDefault();
  if (state.busy) return;

  const name = normaliseName($('player-name').value);
  const problem = validateName(name);
  if (problem) {
    setNameError(problem);
    $('player-name').focus();
    return;
  }
  setNameError(null);

  state.busy = true;
  const restore = setButtonLoading($('start-btn'), 'Starting game…');
  try {
    const data = await api.startGame(name);
    resetGameState();
    state.gameId = data.gameId;
    state.gameCode = data.gameCode;
    state.playerName = data.playerName;
    state.initialStages = data.pipeline;
    state.stages = [...data.pipeline];
    state.totalQuestions = data.totalQuestions;
    state.nextAttemptScore = data.nextAttemptScore;
    saveSession();
    buildHudRail();

    $('instructions-name').textContent = state.playerName;
    showScreen('instructions');
  } catch (err) {
    setNameError(err.message);
  } finally {
    restore();
    state.busy = false;
  }
}

/* ---------- 2. Instructions ---------- */

function handleStartMission() {
  renderPipeline();
  renderPipelineStatus();
  showScreen('pipeline');
}

/* ---------- 3. Pipeline puzzle ---------- */

function renderPipeline() {
  const list = $('pipeline-list');
  list.innerHTML = '';
  list.classList.toggle('is-solved', state.pipelineComplete);

  state.stages.forEach((stage, index) => {
    const item = el('li', 'stage-slot');
    const card = el('button', 'stage-card');
    card.type = 'button';
    card.dataset.index = String(index);
    card.dataset.stage = stage.id;
    card.style.setProperty('--i', index);

    const selected = state.selectedIndex === index;
    card.setAttribute('aria-pressed', String(selected));
    if (state.pipelineComplete) {
      card.classList.add('is-locked');
      card.setAttribute('aria-disabled', 'true');
      card.setAttribute('aria-label', `Position ${index + 1}: ${stage.name}. ${stage.description}`);
    } else {
      card.draggable = true;
      const action = state.selectedIndex === null
        ? 'Select to move'
        : selected ? 'Selected. Choose another card to swap with' : 'Swap with the selected card';
      card.setAttribute('aria-label', `Position ${index + 1}: ${stage.name}. ${stage.description} ${action}.`);
    }

    const num = el('span', 'slot-num', String(index + 1));
    num.setAttribute('aria-hidden', 'true');
    const icon = el('span', 'stage-icon');
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = STAGE_ICONS[stage.id] || '';
    const body = el('span', 'stage-body');
    body.setAttribute('aria-hidden', 'true');
    body.append(el('span', 'stage-name', stage.name), el('span', 'stage-desc', stage.description));

    card.append(num, icon, body);
    item.appendChild(card);
    list.appendChild(item);
  });
}

function renderPipelineStatus() {
  const solved = state.pipelineComplete;
  $('pipeline-actions').hidden = solved;
  $('to-quiz-actions').hidden = !solved;
  $('pipeline-instruction').hidden = solved;

  const info = $('attempt-info');
  if (solved) {
    info.textContent = '';
  } else if (state.pipelineAttempts === 0) {
    info.textContent = 'Get it right on your first try for the full 20 points.';
  } else {
    info.textContent = `Attempt ${state.pipelineAttempts + 1} is worth ${state.nextAttemptScore} points.`;
  }

  if (solved && $('pipeline-feedback').hidden) {
    showPipelineFeedback('success', 'Pipeline assembled', `You earned ${state.pipelineScore} points. On to the quiz!`);
  }
}

function showPipelineFeedback(type, title, body) {
  const box = $('pipeline-feedback');
  box.className = `feedback is-${type}`;
  box.innerHTML = '';
  box.append(el('p', 'feedback-title', title));
  if (body) box.append(el('p', 'feedback-body', body));
  box.hidden = false;
}

function hidePipelineFeedback() {
  $('pipeline-feedback').hidden = true;
}

/** Remembers where every card is, so we can animate the swap (FLIP technique). */
function captureCardPositions() {
  const positions = new Map();
  document.querySelectorAll('.stage-card').forEach((card) => {
    positions.set(card.dataset.stage, card.getBoundingClientRect());
  });
  return positions;
}

function animateFromPositions(previous) {
  if (prefersReducedMotion()) return;
  document.querySelectorAll('.stage-card').forEach((card) => {
    const before = previous.get(card.dataset.stage);
    if (!before) return;
    const after = card.getBoundingClientRect();
    const dx = before.left - after.left;
    const dy = before.top - after.top;
    if (!dx && !dy) return;
    card.animate(
      [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
      { duration: 320, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }
    );
  });
}

function swapStages(fromIndex, toIndex) {
  if (fromIndex === toIndex) return;
  const positions = captureCardPositions();
  const first = state.stages[fromIndex];
  const second = state.stages[toIndex];
  state.stages[fromIndex] = second;
  state.stages[toIndex] = first;
  state.selectedIndex = null;

  renderPipeline();
  animateFromPositions(positions);
  saveSession();
  hidePipelineFeedback();

  $('swap-announcer').textContent = `Swapped ${first.name} and ${second.name}. ${first.name} is now at position ${toIndex + 1}.`;
  const moved = document.querySelector(`.stage-card[data-index="${toIndex}"]`);
  if (moved) moved.focus({ preventScroll: true });
}

function handleCardTap(event) {
  const card = event.target.closest('.stage-card');
  if (!card || state.pipelineComplete || state.busy) return;
  const index = Number(card.dataset.index);

  if (state.selectedIndex === null) {
    state.selectedIndex = index;
    renderPipeline();
    $('swap-announcer').textContent = `${state.stages[index].name} selected. Choose another card to swap with.`;
    document.querySelector(`.stage-card[data-index="${index}"]`).focus({ preventScroll: true });
  } else if (state.selectedIndex === index) {
    state.selectedIndex = null;
    renderPipeline();
    $('swap-announcer').textContent = 'Selection cleared.';
    document.querySelector(`.stage-card[data-index="${index}"]`).focus({ preventScroll: true });
  } else {
    swapStages(state.selectedIndex, index);
  }
}

/* Optional drag-and-drop for mouse users (tap-to-swap works everywhere). */
let dragFromIndex = null;

function handleDragStart(event) {
  const card = event.target.closest('.stage-card');
  if (!card || state.pipelineComplete) return;
  dragFromIndex = Number(card.dataset.index);
  card.classList.add('is-dragging');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', card.dataset.index);
}

function handleDragOver(event) {
  const card = event.target.closest('.stage-card');
  if (!card || dragFromIndex === null) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('.is-drop-target').forEach((node) => {
    if (node !== card) node.classList.remove('is-drop-target');
  });
  if (Number(card.dataset.index) !== dragFromIndex) card.classList.add('is-drop-target');
}

function handleDrop(event) {
  const card = event.target.closest('.stage-card');
  if (!card || dragFromIndex === null) return;
  event.preventDefault();
  const toIndex = Number(card.dataset.index);
  const fromIndex = dragFromIndex;
  dragFromIndex = null;
  swapStages(fromIndex, toIndex);
}

function handleDragEnd() {
  dragFromIndex = null;
  document.querySelectorAll('.is-dragging, .is-drop-target').forEach((node) => {
    node.classList.remove('is-dragging', 'is-drop-target');
  });
}

function handleResetOrder() {
  if (state.pipelineComplete || state.busy) return;
  const positions = captureCardPositions();
  state.stages = [...state.initialStages];
  state.selectedIndex = null;
  renderPipeline();
  animateFromPositions(positions);
  saveSession();
  hidePipelineFeedback();
  $('swap-announcer').textContent = 'Order reset to the starting shuffle.';
}

async function handleSubmitPipeline() {
  if (state.busy || state.pipelineComplete) return;
  state.busy = true;
  state.selectedIndex = null;
  renderPipeline();

  const restore = setButtonLoading($('submit-pipeline-btn'), 'Checking pipeline…');
  $('reset-btn').disabled = true;
  try {
    const result = await api.submitPipeline(state.gameId, state.stages.map((stage) => stage.id));
    state.pipelineAttempts = result.attempts;

    if (result.correct) {
      const previousTotal = state.pipelineScore + state.quizScore;
      state.pipelineComplete = true;
      state.pipelineScore = result.pipelineScore;
      renderPipeline();
      const attemptText = result.attempts === 1 ? 'on your first attempt' : `in ${result.attempts} attempts`;
      showPipelineFeedback('success', result.message, `+${result.pipelineScore} points ${attemptText}. Next up: the quiz.`);
      renderPipelineStatus();
      updateHud();
      updateScore(previousTotal);
      $('to-quiz-btn').focus({ preventScroll: true });
    } else {
      state.nextAttemptScore = result.nextAttemptScore;
      const placed = `${result.correctPositions} of ${result.totalStages} stages are already in the right spot.`;
      showPipelineFeedback('error', result.message, `${result.hint} ${placed}`);
      renderPipelineStatus();
      const list = $('pipeline-list');
      list.classList.remove('is-shake');
      void list.offsetWidth;
      list.classList.add('is-shake');
    }
  } catch (err) {
    handleApiError(err);
  } finally {
    restore();
    $('reset-btn').disabled = false;
    state.busy = false;
  }
}

/* ---------- 4. Quiz ---------- */

function startQuiz() {
  showScreen('quiz');
  loadQuestion();
}

function setProgress(completed) {
  const total = state.totalQuestions;
  $('quiz-progress-fill').style.width = `${(completed / total) * 100}%`;
  const bar = $('quiz-progressbar');
  bar.setAttribute('aria-valuemax', String(total));
  bar.setAttribute('aria-valuenow', String(completed));
}

async function loadQuestion(triggerButton) {
  const card = $('question-card');
  card.setAttribute('aria-busy', 'true');
  $('question-error').hidden = true;
  const restore = triggerButton ? setButtonLoading(triggerButton, 'Loading question…') : null;
  if (!triggerButton) {
    $('question-text').textContent = 'Loading question…';
    $('question-topic').textContent = '';
    $('options').innerHTML = '';
    $('answer-feedback').hidden = true;
    $('next-btn').hidden = true;
  }
  state.busy = true;

  try {
    const question = await api.getQuestion(state.gameId);
    if (question.done) {
      await finishGame();
      return;
    }
    state.currentQuestion = question;
    state.lastAnswer = null;
    renderQuestion(question);
  } catch (err) {
    if (err.status === 404 || err.status === 409) {
      handleApiError(err);
    } else {
      $('question-error-text').textContent = err.message;
      $('question-error').hidden = false;
    }
  } finally {
    if (restore) restore();
    card.setAttribute('aria-busy', 'false');
    state.busy = false;
  }
}

function renderQuestion(question) {
  $('quiz-count').textContent = `Question ${question.questionNumber} of ${question.totalQuestions}`;
  setProgress(question.questionNumber - 1);
  $('question-topic').textContent = question.category || '';
  $('question-text').textContent = question.question;
  $('answer-feedback').hidden = true;
  $('next-btn').hidden = true;

  const options = $('options');
  options.innerHTML = '';
  question.options.forEach((option) => {
    const button = el('button', 'option');
    button.type = 'button';
    button.dataset.answer = option.id;
    button.setAttribute('aria-label', `${option.id}. ${option.text}`);
    const letter = el('span', 'option-letter', option.id);
    letter.setAttribute('aria-hidden', 'true');
    const text = el('span', 'option-text', option.text);
    text.setAttribute('aria-hidden', 'true');
    button.append(letter, text);
    options.appendChild(button);
  });
  updateHud();
}

function setOptionsLocked(locked) {
  document.querySelectorAll('.option').forEach((button) => {
    if (locked) button.setAttribute('aria-disabled', 'true');
    else button.removeAttribute('aria-disabled');
  });
}

async function handleAnswer(event) {
  const button = event.target.closest('.option');
  if (!button || state.busy || state.lastAnswer || !state.currentQuestion) return;
  if (button.getAttribute('aria-disabled') === 'true') return;

  state.busy = true;
  setOptionsLocked(true);
  button.classList.add('is-pending');
  $('question-card').setAttribute('aria-busy', 'true');

  try {
    const result = await api.submitAnswer(state.gameId, state.currentQuestion.questionId, button.dataset.answer);
    showAnswerResult(result);
  } catch (err) {
    button.classList.remove('is-pending');
    setOptionsLocked(false);
    handleApiError(err);
  } finally {
    $('question-card').setAttribute('aria-busy', 'false');
    state.busy = false;
  }
}

function showAnswerResult(result) {
  state.lastAnswer = result;
  const previousTotal = state.pipelineScore + state.quizScore;
  state.quizScore = result.quizScore;
  state.quizResults[result.questionNumber - 1] = result.correct;

  document.querySelectorAll('.option').forEach((option) => {
    option.classList.remove('is-pending');
    const letter = option.dataset.answer;
    if (letter === result.correctAnswer) option.classList.add('is-correct');
    else if (letter === result.selectedAnswer) option.classList.add('is-wrong');
    else option.classList.add('is-dimmed');
  });

  const feedback = $('answer-feedback');
  feedback.className = `answer-feedback ${result.correct ? 'is-correct' : 'is-wrong'}`;
  const awarded = result.scoreAwarded ? ` +${result.scoreAwarded} points` : '';
  $('answer-verdict').textContent = result.correct
    ? `Correct!${awarded}`
    : `Not quite. The answer is ${result.correctAnswer}.`;
  $('answer-explanation').textContent = result.explanation;
  feedback.hidden = false;

  setProgress(result.questionNumber);
  updateHud();
  updateScore(previousTotal);

  const next = $('next-btn');
  next.textContent = result.isLastQuestion ? 'See my results' : 'Next question';
  next.hidden = false;
  next.focus({ preventScroll: true });
  if (window.innerHeight < next.getBoundingClientRect().bottom) {
    next.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'end' });
  }
}

function handleNext() {
  if (state.busy) return;
  const button = $('next-btn');
  if (state.lastAnswer && state.lastAnswer.isLastQuestion) finishGame(button);
  else loadQuestion(button);
}

/* ---------- 5. Results ---------- */

async function finishGame(triggerButton) {
  state.busy = true;
  const restore = triggerButton ? setButtonLoading(triggerButton, 'Calculating result…') : null;
  try {
    const results = await api.finish(state.gameId);
    state.results = results;
    renderResults(results);
    showScreen('results');
  } catch (err) {
    handleApiError(err);
  } finally {
    if (restore) restore();
    state.busy = false;
  }
}

function formatPercentage(value) {
  return `${Number(Number(value).toFixed(2))}%`;
}

function formatDateTime(isoString, options = { dateStyle: 'medium', timeStyle: 'short' }) {
  if (!isoString) return '';
  const date = new Date(isoString);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString(undefined, options);
}

function renderResults(results) {
  $('result-name').textContent = results.playerName;
  $('result-pipeline').textContent = results.pipelineCorrect ? '✅ Completed' : 'Not completed';
  $('result-quiz').textContent = `${results.quizCorrect} / ${results.totalQuestions}`;
  $('result-pipeline-score').textContent = `${results.pipelineScore} / ${results.maxPipelineScore}`;
  $('result-quiz-score').textContent = `${results.quizScore} / ${results.maxQuizScore}`;
  $('result-message').textContent = results.message;
  $('result-date').textContent = `Completed ${formatDateTime(results.completedAt)}`;
  $('result-code').textContent = results.gameCode;
  document.querySelector('.result-total-max').textContent = `/ ${results.maxScore}`;

  animateNumber($('result-total'), 0, results.totalScore, { duration: 900 });
  animateNumber($('result-percent'), 0, results.percentage, { duration: 900, decimals: 2, suffix: '%' });

  const card = $('result-card');
  card.classList.remove('is-revealed');
  void card.offsetWidth;
  card.classList.add('is-revealed');
}

function handlePlayAgain() {
  clearSession();
  const name = state.playerName;
  resetGameState();
  $('player-name').value = name;
  setNameError(null);
  showScreen('start');
}

/* Result card image, drawn client-side on a canvas (no external service). */

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function fitFont(ctx, text, weight, maxSize, maxWidth, family) {
  let size = maxSize;
  do {
    ctx.font = `${weight} ${size}px ${family}`;
    size -= 2;
  } while (ctx.measureText(text).width > maxWidth && size > 24);
}

async function downloadResultCard() {
  const results = state.results;
  if (!results) return;
  const button = $('download-card-btn');
  const restore = setButtonLoading(button, 'Preparing image…');

  try {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const W = 1080;
    const H = 1350;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    const sans = "Sora, 'Segoe UI', system-ui, sans-serif";
    const mono = "'JetBrains Mono', ui-monospace, Menlo, monospace";

    // Background
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#0F1A30');
    bg.addColorStop(1, '#17163A');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    const glow = (x, y, r, color) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    };
    glow(120, 80, 620, 'rgba(76,201,232,0.20)');
    glow(1000, 1250, 700, 'rgba(142,124,245,0.24)');

    // Card
    const accent = ctx.createLinearGradient(80, 80, W - 80, H - 80);
    accent.addColorStop(0, '#4CC9E8');
    accent.addColorStop(0.55, '#6A92F2');
    accent.addColorStop(1, '#8E7CF5');
    roundedRect(ctx, 70, 70, W - 140, H - 140, 48);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = accent;
    ctx.stroke();

    const left = 140;
    const contentWidth = W - 280;
    ctx.textBaseline = 'alphabetic';

    ctx.fillStyle = '#9DABC6';
    ctx.font = `600 34px ${sans}`;
    ctx.fillText('DevOps Pipeline Puzzle', left, 190);

    // Completed pill
    ctx.font = `600 28px ${sans}`;
    const pillText = 'Completed';
    const pillWidth = ctx.measureText(pillText).width + 56;
    roundedRect(ctx, W - 140 - pillWidth, 148, pillWidth, 56, 28);
    ctx.fillStyle = 'rgba(62,215,156,0.16)';
    ctx.fill();
    ctx.fillStyle = '#9FF0CD';
    ctx.fillText(pillText, W - 140 - pillWidth + 28, 186);

    ctx.fillStyle = '#9DABC6';
    ctx.font = `400 34px ${sans}`;
    ctx.fillText('Participant', left, 300);
    ctx.fillStyle = '#E8EEFA';
    fitFont(ctx, results.playerName, 700, 76, contentWidth, sans);
    ctx.fillText(results.playerName, left, 385);

    // Score
    ctx.font = `800 200px ${sans}`;
    const scoreText = String(results.totalScore);
    ctx.fillText(scoreText, left - 8, 610);
    const scoreWidth = ctx.measureText(scoreText).width;
    ctx.fillStyle = '#9DABC6';
    ctx.font = `600 64px ${sans}`;
    ctx.fillText(`/ ${results.maxScore}`, left + scoreWidth + 16, 610);

    const percentText = formatPercentage(results.percentage);
    ctx.font = `700 46px ${sans}`;
    const percentWidth = ctx.measureText(percentText).width + 60;
    roundedRect(ctx, W - 140 - percentWidth, 540, percentWidth, 76, 38);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.fillStyle = '#06101F';
    ctx.fillText(percentText, W - 140 - percentWidth + 30, 594);

    // Stats grid
    const stats = [
      ['Pipeline', results.pipelineCorrect ? 'Completed' : 'Not completed'],
      ['Quiz', `${results.quizCorrect} / ${results.totalQuestions} correct`],
      ['Pipeline score', `${results.pipelineScore} / ${results.maxPipelineScore}`],
      ['Quiz score', `${results.quizScore} / ${results.maxQuizScore}`]
    ];
    const cellW = (contentWidth - 24) / 2;
    stats.forEach(([label, value], index) => {
      const x = left + (index % 2) * (cellW + 24);
      const y = 680 + Math.floor(index / 2) * 150;
      roundedRect(ctx, x, y, cellW, 126, 22);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(160,188,245,0.18)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#9DABC6';
      ctx.font = `400 28px ${sans}`;
      ctx.fillText(label, x + 30, y + 50);
      ctx.fillStyle = '#E8EEFA';
      ctx.font = `600 38px ${sans}`;
      ctx.fillText(value, x + 30, y + 98);
    });

    // Achievement badge
    ctx.font = `700 40px ${sans}`;
    const badgeText = '🏆  Pipeline shipped';
    const badgeWidth = ctx.measureText(badgeText).width + 64;
    roundedRect(ctx, left, 1000, badgeWidth, 84, 22);
    ctx.fillStyle = 'rgba(244,207,122,0.12)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(244,207,122,0.5)';
    ctx.stroke();
    ctx.fillStyle = '#F4CF7A';
    ctx.fillText(badgeText, left + 32, 1056);

    // Footer: pipeline rail + date + code
    const railY = 1150;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(left + 14, railY);
    ctx.lineTo(W - 140 - 14, railY);
    ctx.stroke();
    for (let i = 0; i < 6; i += 1) {
      const x = left + 14 + i * ((contentWidth - 28) / 5);
      ctx.beginPath();
      ctx.arc(x, railY, 14, 0, Math.PI * 2);
      ctx.fillStyle = '#15213B';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.stroke();
    }
    ctx.fillStyle = '#9DABC6';
    ctx.font = `400 30px ${sans}`;
    ctx.fillText(`Completed ${formatDateTime(results.completedAt)}`, left, 1230);
    ctx.font = `500 28px ${mono}`;
    const codeWidth = ctx.measureText(results.gameCode).width;
    ctx.fillText(results.gameCode, W - 140 - codeWidth, 1230);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Canvas export failed');
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const slug = results.playerName.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'player';
    link.href = url;
    link.download = `devops-pipeline-result-${slug}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch (err) {
    showToast('The result card couldn’t be created on this device. A screenshot works just as well.');
  } finally {
    restore();
  }
}

/* ---------- 6. Leaderboard ---------- */

function openLeaderboard(returnTo) {
  state.leaderboardReturn = returnTo;
  showScreen('leaderboard');
  loadLeaderboard();
}

async function loadLeaderboard() {
  const status = $('leaderboard-status');
  const table = $('leaderboard-table');
  const refresh = $('leaderboard-refresh-btn');
  const restore = setButtonLoading(refresh, 'Refreshing…');
  status.textContent = 'Loading leaderboard…';

  try {
    const data = await api.leaderboard();
    const body = $('leaderboard-body');
    body.innerHTML = '';
    if (!data.entries.length) {
      table.hidden = true;
      status.textContent = 'No completed games yet. Finish a game to claim the first spot.';
      return;
    }
    data.entries.forEach((entry) => {
      const row = document.createElement('tr');
      const rankCell = document.createElement('td');
      const rank = el('span', `rank${entry.rank <= 3 ? ` rank-${entry.rank}` : ''}`, String(entry.rank));
      rankCell.appendChild(rank);
      const nameCell = el('td', 'name-cell', entry.name);
      const scoreCell = el('td', 'num', String(entry.score));
      const dateCell = el(
        'td',
        'date-cell',
        formatDateTime(entry.completedAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      );
      row.append(rankCell, nameCell, scoreCell, dateCell);
      body.appendChild(row);
    });
    status.textContent = '';
    table.hidden = false;
  } catch (err) {
    table.hidden = true;
    status.textContent = err.status === 404 ? 'The leaderboard is turned off for this event.' : err.message;
  } finally {
    restore();
  }
}

function handleLeaderboardBack() {
  if (state.leaderboardReturn === 'results' && state.results) showScreen('results');
  else showScreen('start');
}

function applyLeaderboardSetting(enabled) {
  state.leaderboardEnabled = enabled;
  $('start-leaderboard-btn').hidden = !enabled;
  $('results-leaderboard-btn').hidden = !enabled;
}

/* ---------- Boot ---------- */

function bindEvents() {
  $('start-form').addEventListener('submit', handleStart);
  $('player-name').addEventListener('input', () => {
    if (!$('name-error').hidden) setNameError(null);
  });
  $('start-leaderboard-btn').addEventListener('click', () => openLeaderboard('start'));
  $('start-mission-btn').addEventListener('click', handleStartMission);

  const list = $('pipeline-list');
  list.addEventListener('click', handleCardTap);
  list.addEventListener('dragstart', handleDragStart);
  list.addEventListener('dragover', handleDragOver);
  list.addEventListener('drop', handleDrop);
  list.addEventListener('dragend', handleDragEnd);
  $('reset-btn').addEventListener('click', handleResetOrder);
  $('submit-pipeline-btn').addEventListener('click', handleSubmitPipeline);
  $('to-quiz-btn').addEventListener('click', startQuiz);

  $('options').addEventListener('click', handleAnswer);
  $('next-btn').addEventListener('click', handleNext);
  $('question-retry-btn').addEventListener('click', () => loadQuestion());

  $('play-again-btn').addEventListener('click', handlePlayAgain);
  $('results-leaderboard-btn').addEventListener('click', () => openLeaderboard('results'));
  $('download-card-btn').addEventListener('click', downloadResultCard);
  $('leaderboard-back-btn').addEventListener('click', handleLeaderboardBack);
  $('leaderboard-refresh-btn').addEventListener('click', loadLeaderboard);

  $('toast-close').addEventListener('click', hideToast);
}

function init() {
  renderHeroRail();
  buildHudRail();
  bindEvents();

  // Leaderboard can be switched off on the server; hide the buttons if so.
  api.health()
    .then((health) => applyLeaderboardSetting(health.leaderboardEnabled !== false))
    .catch(() => {
      /* the game still loads; errors surface when the player acts */
    });

  const saved = loadSession();
  if (saved && saved.gameId) {
    resumeGame(saved.gameId, saved.order);
  } else {
    showScreen('start', { focus: false });
  }
}

document.addEventListener('DOMContentLoaded', init);
