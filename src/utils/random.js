const crypto = require('crypto');

/** Returns a new array shuffled with a cryptographically secure Fisher-Yates shuffle. */
function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Short, human-friendly code shown to players, e.g. GAME-7F42A1. Not used for lookups. */
function createGameCode() {
  return `GAME-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

module.exports = { shuffle, createGameCode };
