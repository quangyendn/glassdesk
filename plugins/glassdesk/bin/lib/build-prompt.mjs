// Render a task envelope plus an optional specialist profile into the single
// prompt string a provider receives.
//
// Mode decides how context travels:
//   advisory        — file contents are inlined; the provider gets no repo access
//   repository-read — paths only; the provider is handed the directory instead
//   patch-proposal  — paths only, plus an explicit diff-and-do-not-apply contract

const MODE_CONTRACT = {
  advisory:
    'You have no access to the repository. Work only from the material below. ' +
    'If something you need is missing, say what is missing rather than guessing.',
  'repository-read':
    'You may read the repository at the working directory you were given. ' +
    'You must not create, modify, or delete any file, and must not run commands ' +
    'that change state.',
  'patch-proposal':
    'You may read the repository at the working directory you were given. ' +
    'Return your change as a unified diff in a fenced block. Do not apply the diff, ' +
    'do not write files, do not commit, do not push.',
};

// Sanitize a string for safe use as a markdown heading.
// Collapses newlines/carriage returns to spaces, strips leading # chars, and trims.
function sanitizeHeading(text) {
  return String(text || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/^#+\s*/, '')
    .trim();
}

// A fenced block must be delimited by more backticks than the longest run
// inside it, or the content can close the fence early and inject markdown
// structure into the prompt.
function fenceFor(content) {
  let longest = 0;
  for (const m of String(content || '').matchAll(/`+/g)) longest = Math.max(longest, m[0].length);
  return '`'.repeat(Math.max(3, longest + 1));
}

function section(out, heading, lines) {
  if (!lines || lines.length === 0) return;
  out.push(`## ${heading}`, ...lines, '');
}

export function buildPrompt({ task, specialist, files = [], mode = 'advisory' }) {
  const out = [];

  // Resolve mode once so it's consistent for both contract text and file handling.
  const resolvedMode = MODE_CONTRACT[mode] ? mode : 'advisory';

  const instructions = specialist?.instructions?.trim();
  if (instructions) {
    out.push(instructions, '');
  }

  out.push(MODE_CONTRACT[resolvedMode], '');

  // Objective: omit if empty or whitespace-only.
  const objective = (task?.objective ?? '').trim() || '(none stated)';
  section(out, 'Objective', [objective]);

  // Context summary: omit if empty or whitespace-only.
  const summary = (task?.context?.summary ?? '').trim();
  if (summary) section(out, 'Context', [summary]);

  section(out, 'Constraints', (task?.constraints ?? []).map((c) => `- ${c}`));
  section(out, 'Out of scope', (task?.out_of_scope ?? []).map((c) => `- ${c}`));
  section(out, 'Acceptance criteria', (task?.acceptance_criteria ?? []).map((c) => `- ${c}`));

  if (resolvedMode === 'advisory') {
    for (const f of files) {
      const fence = fenceFor(f.content);
      out.push(`## File: ${sanitizeHeading(f.path)}`, fence, f.content, fence, '');
    }
  } else if (files.length) {
    section(out, 'Files in scope', files.map((f) => `- ${f.path}`));
  }

  for (const item of task?.context?.inline ?? []) {
    const fence = fenceFor(item.content);
    const label = sanitizeHeading(item.label ?? 'context');
    out.push(`## ${label}`, fence, item.content ?? '', fence, '');
  }

  return out.join('\n').trimEnd();
}
