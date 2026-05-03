#!/usr/bin/env node
const { spawnSync } = require('child_process');
const path = require('path');

const pluginRoot = path.resolve(__dirname, '..');
const script = path.join(pluginRoot, 'skills', 'audit', 'scripts', 'audit.sh');

const r = spawnSync('bash', [script, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, CLAUDE_PLUGIN_ROOT: pluginRoot },
});

if (r.error) {
  console.error(`ccaudit: failed to spawn bash — ${r.error.message}`);
  process.exit(127);
}
process.exit(r.status ?? 1);
