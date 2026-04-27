#!/usr/bin/env node
'use strict';

// Reads a Claude Code session JSONL and emits structured insight signals as JSON.
// Usage: node parse-session-insights.cjs <path.jsonl>
// Output: { prompts:[], assistant_texts:[], tool_calls:[{name,success}], errors:[] }
//
// SECURITY: never logs tool_result content (may contain credentials/file contents).
// Only extracts: user prompt text, assistant text, tool call names, stop_reason.

const fs = require('fs');
const readline = require('readline');

const jsonlPath = process.argv[2];
if (!jsonlPath) {
  process.stderr.write('Usage: parse-session-insights.cjs <path.jsonl>\n');
  process.exit(1);
}

if (!fs.existsSync(jsonlPath)) {
  process.stderr.write(`File not found: ${jsonlPath}\n`);
  process.exit(1);
}

const result = { prompts: [], assistant_texts: [], tool_calls: [], errors: [] };

const rl = readline.createInterface({
  input: fs.createReadStream(jsonlPath),
  crlfDelay: Infinity,
});

rl.on('line', (line) => {
  if (!line.trim()) return;
  let record;
  try { record = JSON.parse(line); } catch (_) { return; }

  if (record.type !== 'user' && record.type !== 'assistant') return;
  const msg = record.message;
  if (!msg) return;

  if (msg.role === 'user') {
    const text = extractText(msg.content);
    if (text) result.prompts.push(text);
  }

  if (msg.role === 'assistant') {
    const stopReason = msg.stop_reason || '';
    if (stopReason === 'error') {
      result.errors.push({ timestamp: record.timestamp || null });
    }
    if (Array.isArray(msg.content)) {
      msg.content.forEach((block) => {
        if (block.type === 'text' && block.text) {
          result.assistant_texts.push(block.text.trim());
        }
        // Only capture tool name + success heuristic — never tool output content
        if (block.type === 'tool_use') {
          const name = block.name || block.tool_name || block.id || 'unknown';
          result.tool_calls.push({ name, success: stopReason === 'end_turn' });
        }
      });
    }
  }
});

rl.on('close', () => {
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
});

function extractText(content) {
  if (typeof content === 'string') return content.trim() || null;
  if (!Array.isArray(content)) return null;
  return content
    .filter((b) => b.type === 'text' && b.text)
    .map((b) => b.text)
    .join(' ')
    .trim() || null;
}
