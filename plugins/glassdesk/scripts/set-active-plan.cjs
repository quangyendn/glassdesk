#!/usr/bin/env node
/**
 * Update session state with new active plan
 *
 * Usage: node "$GD_PLUGIN_PATH/scripts/set-active-plan.cjs" <plan-path>
 *
 * Note: $GD_PLUGIN_PATH is set by session-init.cjs hook and works for both
 * local and globally installed plugins.
 *
 * This script updates the session temp file with the new active plan path,
 * allowing subagents to receive the latest plan context via SubagentStart hook.
 *
 * The session temp file (/tmp/gd-session-{id}.json) is the source of truth
 * for plan context within a session. Env vars ($GD_ACTIVE_PLAN) are just
 * the initial snapshot from session start.
 */

const { writeSessionState, readSessionState } = require('../hooks/lib/gd-config-utils.cjs');

const sessionId = process.env.GD_SESSION_ID;
const newPlan = process.argv[2];

if (!newPlan) {
  console.error('Error: Plan path required');
  console.log('Usage: node "$GD_PLUGIN_PATH/scripts/set-active-plan.cjs" <plan-path>');
  console.log('Example: node "$GD_PLUGIN_PATH/scripts/set-active-plan.cjs" plans/251207-1030-feature-name');
  process.exit(1);
}

if (!sessionId) {
  console.warn('GD_SESSION_ID not set; run npx glassdesk init to configure hooks.');
  console.log(`Would set active plan to: ${newPlan}`);
  process.exit(0);
}

const current = readSessionState(sessionId) || {};
const success = writeSessionState(sessionId, {
  ...current,
  activePlan: newPlan,
  timestamp: Date.now()
});

if (success) {
  console.log(`Active plan set to: ${newPlan}`);
} else {
  console.error('Failed to update session state');
  process.exit(1);
}
