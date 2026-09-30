/**
 * Central game configuration. Scoring rules live here so the
 * server is the single source of truth for every point awarded.
 */
const config = {
  questionsPerGame: 6,
  pointsPerQuestion: 10,
  maxPipelineScore: 20,
  maxNameLength: 40,
  leaderboardLimit: 20,
  leaderboardEnabled: process.env.LEADERBOARD_ENABLED !== 'false'
};

config.maxQuizScore = config.questionsPerGame * config.pointsPerQuestion; // 60
config.maxTotalScore = config.maxPipelineScore + config.maxQuizScore; // 80

/** Points for solving the pipeline: 20 on try 1, 15 on try 2, 10 after that. */
config.pipelineScoreForAttempt = (attempt) => {
  if (attempt <= 1) return 20;
  if (attempt === 2) return 15;
  return 10;
};

module.exports = config;
