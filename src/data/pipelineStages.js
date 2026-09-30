/**
 * The six DevOps pipeline stages in their CORRECT order.
 * Players receive them shuffled; the server validates their answer.
 */
const PIPELINE_STAGES = [
  { id: 'CODE', name: 'Code', description: 'Write and commit changes using version control.' },
  { id: 'BUILD', name: 'Build', description: 'Compile the code and resolve its dependencies.' },
  { id: 'TEST', name: 'Test', description: 'Run automated tests to catch bugs early.' },
  { id: 'PACKAGE', name: 'Package', description: 'Create a deployable artifact or container image.' },
  { id: 'DEPLOY', name: 'Deploy', description: 'Release the application to an environment.' },
  { id: 'MONITOR', name: 'Monitor', description: 'Observe application health and performance.' }
];

const CORRECT_PIPELINE_ORDER = PIPELINE_STAGES.map((stage) => stage.id);

/**
 * Hint shown for the FIRST position the player got wrong.
 * They nudge towards the idea without spelling out the full answer.
 */
const POSITION_HINTS = [
  'Every pipeline starts where a developer’s change begins.',
  'Source code has to become something runnable before it can be checked.',
  'Verify that the build actually works before you bundle it for release.',
  'You need a deployable artifact before anything can be released.',
  'Think about what needs to happen before you can watch the app in production.',
  'The last stage never really ends: it keeps watching the running app.'
];

const stageById = new Map(PIPELINE_STAGES.map((stage) => [stage.id, stage]));

/** Public view of a stage (safe to send to the browser). */
function toStageView(stageId) {
  const stage = stageById.get(stageId);
  return { id: stage.id, name: stage.name, description: stage.description };
}

module.exports = { PIPELINE_STAGES, CORRECT_PIPELINE_ORDER, POSITION_HINTS, stageById, toStageView };
