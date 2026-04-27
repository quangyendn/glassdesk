#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

const cwd = process.cwd();
// Claude Code encodes project path: every non-alphanumeric char → '-'
const encodedCwd = cwd.replace(/[^a-zA-Z0-9]/g, '-');
const projectsDir = path.join(os.homedir(), '.claude', 'projects', encodedCwd);

if (!fs.existsSync(projectsDir)) {
  // Fallback: glob all dirs under ~/.claude/projects/ and find one whose name matches
  const parent = path.join(os.homedir(), '.claude', 'projects');
  let matched = null;
  for (const dir of fs.readdirSync(parent)) {
    const decoded = dir.replace(/-/g, '/').replace(/^\//, '');
    if (cwd.endsWith(decoded) || decoded.endsWith(cwd.replace(/^\//, ''))) {
      matched = path.join(parent, dir);
      break;
    }
  }
  if (!matched) { process.stderr.write(`No project dir found for ${cwd}\n`); process.exit(1); }
  findLatest(matched);
} else {
  findLatest(projectsDir);
}

function findLatest(dir) {
  // Try sessions-index.json first
  const indexPath = path.join(dir, 'sessions-index.json');
  if (fs.existsSync(indexPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
      const sessions = Array.isArray(raw) ? raw : Object.values(raw);
      sessions.sort((a, b) => {
        const ta = new Date(a.lastModified || a.modified || a.updatedAt || 0).getTime();
        const tb = new Date(b.lastModified || b.modified || b.updatedAt || 0).getTime();
        return tb - ta;
      });
      const latest = sessions[0];
      if (latest) {
        const sid = latest.sessionId || latest.id;
        if (sid) {
          const jsonlPath = path.join(dir, `${sid}.jsonl`);
          if (fs.existsSync(jsonlPath)) { process.stdout.write(jsonlPath + '\n'); process.exit(0); }
        }
      }
    } catch (_) { /* fall through to mtime scan */ }
  }

  // Mtime fallback: find most recently modified .jsonl
  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.jsonl'))
    .map(f => {
      const full = path.join(dir, f);
      return { full, mtime: fs.statSync(full).mtime.getTime() };
    })
    .sort((a, b) => b.mtime - a.mtime);

  if (files.length === 0) { process.stderr.write(`No JSONL files in ${dir}\n`); process.exit(1); }
  process.stdout.write(files[0].full + '\n');
}
