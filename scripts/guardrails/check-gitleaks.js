#!/usr/bin/env node
// Verify that the `gitleaks` binary is on PATH. If absent, print OS-specific
// install instructions and exit 1.

import { execSync } from 'node:child_process';
import { platform } from 'node:os';

function check() {
  try {
    execSync('gitleaks version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function instructions() {
  const p = platform();
  const lines = [
    '[guardrails] `gitleaks` is required but not found on PATH.',
    '',
    'Install instructions:',
  ];
  if (p === 'darwin') {
    lines.push('  brew install gitleaks');
  } else if (p === 'linux') {
    lines.push('  # Debian/Ubuntu (via release tarball):');
    lines.push('  curl -sSfL https://github.com/gitleaks/gitleaks/releases/latest/download/gitleaks_$(uname -s | tr A-Z a-z)_$(uname -m).tar.gz | tar -xz -C /tmp');
    lines.push('  sudo mv /tmp/gitleaks /usr/local/bin/');
  } else if (p === 'win32') {
    lines.push('  scoop install gitleaks');
    lines.push('  # or: choco install gitleaks');
  } else {
    lines.push('  See https://github.com/gitleaks/gitleaks#installing');
  }
  lines.push('');
  lines.push('After installing, re-run your git command.');
  return lines.join('\n');
}

if (!check()) {
  console.error(instructions());
  process.exit(1);
}
