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

function section(out, heading, lines) {
  if (!lines || lines.length === 0) return;
  out.push(`## ${heading}`, ...lines, '');
}

export function buildPrompt({ task, specialist, files = [], mode = 'advisory' }) {
  const out = [];

  if (specialist?.instructions) {
    out.push(specialist.instructions.trim(), '');
  }

  out.push(MODE_CONTRACT[mode] ?? MODE_CONTRACT.advisory, '');

  section(out, 'Objective', [task?.objective ?? '(none stated)']);

  if (task?.context?.summary) section(out, 'Context', [task.context.summary]);
  section(out, 'Constraints', (task?.constraints ?? []).map((c) => `- ${c}`));
  section(out, 'Out of scope', (task?.out_of_scope ?? []).map((c) => `- ${c}`));
  section(out, 'Acceptance criteria', (task?.acceptance_criteria ?? []).map((c) => `- ${c}`));

  if (mode === 'advisory') {
    for (const f of files) {
      out.push(`## File: ${f.path}`, '```', f.content, '```', '');
    }
  } else if (files.length) {
    section(out, 'Files in scope', files.map((f) => `- ${f.path}`));
  }

  for (const item of task?.context?.inline ?? []) {
    out.push(`## ${item.label ?? 'context'}`, '```', item.content ?? '', '```', '');
  }

  return out.join('\n').trimEnd();
}
