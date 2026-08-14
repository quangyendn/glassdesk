// Policy enforcement. Every gate fails closed: input it cannot evaluate is
// rejected rather than waved through.

import fs from 'node:fs';
import path from 'node:path';
import { EXIT } from './exit-codes.mjs';
import { matchesDenyGlob, scanForSecrets } from './secret-patterns.mjs';

const CLASSIFICATIONS = ['public', 'internal', 'confidential', 'restricted'];
const DEFAULT_MAX_CONTEXT_BYTES = 400000;

// Modes in which the provider is handed a directory and reads it itself,
// rather than being handed only the text the gates already vetted.
export const REPOSITORY_VISIBLE_MODES = ['repository-read', 'patch-proposal'];

// Directories skipped by the repository sweep. `.git` holds no deny-listed
// filename and would multiply the walk; the rest are vendored or generated
// trees whose size makes an exhaustive walk cost more than it is worth. This
// is a stated limit, not a claim of completeness: a credential file placed
// inside one of these is not detected. See docs/external-delegation.md.
const SWEEP_SKIP_DIRS = new Set([
  '.git', 'node_modules', '.venv', 'venv', '__pycache__',
  'dist', 'build', 'out', 'target', '.next', '.nuxt', '.turbo', '.cache',
]);
const SWEEP_MAX_ENTRIES = 50000;

export class GateError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'GateError';
    this.code = code;
  }
}

export function gateMode(provider, mode) {
  const modes = provider.modes || [];
  if (modes.includes(mode)) return null;
  return {
    code: EXIT.UNSUPPORTED,
    message: `mode "${mode}" is not supported by this provider (supports: ${modes.join(', ') || 'none'})`,
  };
}

export function gateCapability(provider, taskType) {
  if (!taskType) return null;
  const caps = provider.capabilities || [];
  if (caps.includes(taskType)) return null;
  return {
    code: EXIT.UNSUPPORTED,
    message: `task type "${taskType}" is not in this provider's capabilities (${caps.join(', ') || 'none'})`,
  };
}

// A profile's `use_for` list is routing metadata the loader already parses and
// fails closed on, and `gateCapability` enforces the provider's equivalent —
// so a specialist applied outside its declared task types was the one place
// where a declared constraint was parsed, carried, and then ignored. Silently
// prepending `code-reviewer` to a debugging task produces a review-shaped
// answer to a question nobody asked. As with gateCapability, a task that
// declares no `task_type` is not constrained.
export function gateSpecialist(specialist, taskType) {
  if (!specialist || !taskType) return null;
  const useFor = specialist.useFor ?? [];
  if (useFor.includes(taskType)) return null;
  return {
    code: EXIT.UNSUPPORTED,
    message:
      `specialist "${specialist.name}" declares use_for [${useFor.join(', ') || 'none'}], ` +
      `which does not include task type "${taskType}"`,
  };
}

export function gatePrivacy(provider, task) {
  const classification = task?.privacy?.classification ?? 'internal';
  if (!CLASSIFICATIONS.includes(classification)) {
    return {
      code: EXIT.PRIVACY,
      message: `unknown privacy classification "${classification}" (expected one of ${CLASSIFICATIONS.join(', ')})`,
    };
  }
  if (classification !== 'restricted') return null;
  if (provider.privacy?.restricted_data_allowed === true) return null;
  return {
    code: EXIT.PRIVACY,
    message:
      'privacy.classification is "restricted"; this provider does not set privacy.restricted_data_allowed',
  };
}

// Loopback, judged from the hostname alone — no DNS, because a name that
// resolves to 127.0.0.1 today can resolve elsewhere on the next lookup, and a
// privacy gate must not depend on a value that changes between the check and
// the request. `*.localhost` is excluded deliberately: RFC 6761 reserves it
// for loopback, but a hosts-file or resolver entry can point it anywhere.
export function isLoopbackHost(host) {
  if (!host || typeof host !== 'string') return false;
  const h = host.toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
  if (h === 'localhost') return true;
  if (h === '::1' || h === '0:0:0:0:0:0:0:1') return true;
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h);
}

// `privacy.execution: local-only` is what earns a provider the right to
// receive restricted data, and `local-openai` is the only entry that has it.
// But its base URL comes from an environment variable, so the registry's claim
// is not self-enforcing: point LOCAL_OPENAI_BASE_URL at a remote host and
// gatePrivacy would still wave restricted data through to it. Verify the claim
// against the URL that will actually be posted to.
export function gateEndpoint(provider, env = process.env) {
  if (provider.type !== 'openai-compatible') return null;
  const localOnly =
    provider.privacy?.execution === 'local-only' || provider.privacy?.restricted_data_allowed === true;
  if (!localOnly) return null;

  const varName = provider.env?.base_url ?? 'base_url';
  const raw = env[provider.env?.base_url] || provider.endpoint_defaults?.base_url || '';
  // An unset base URL is unavailability, which probeProvider already reports —
  // not a privacy violation.
  if (!raw) return null;

  let url;
  try {
    url = new URL(raw);
  } catch {
    return { code: EXIT.PRIVACY, message: `${varName} is not a valid URL: "${raw}"` };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { code: EXIT.PRIVACY, message: `${varName} must be an http(s) URL, got "${url.protocol}"` };
  }
  if (!isLoopbackHost(url.hostname)) {
    return {
      code: EXIT.PRIVACY,
      message:
        `this provider is declared privacy.execution="local-only", but ${varName} points at ` +
        `"${url.hostname}", which is not a loopback address`,
    };
  }
  return null;
}

// In repository-read and patch-proposal the provider is handed scope.root and
// reads it with its own tools, so the per-file deny list gateContext enforces
// on `scope.files` governs only what is *pushed* into the prompt — an unlisted
// .env or private key sitting in that tree is still one `cat` away. Enforce
// the deny list at the directory boundary too: if the tree the provider is
// about to be given contains a denied path, refuse the run rather than hand it
// over and report a `context_sent` list that does not mention it.
export function gateRepositoryExposure(root, { maxEntries = SWEEP_MAX_ENTRIES } = {}) {
  let realRoot;
  try {
    realRoot = fs.realpathSync(path.resolve(root));
  } catch (e) {
    return { code: EXIT.PRIVACY, message: `cannot resolve scope root "${root}": ${e.code || e.message}` };
  }

  const stack = [''];
  let seen = 0;
  while (stack.length) {
    const rel = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(path.join(realRoot, rel), { withFileTypes: true });
    } catch (e) {
      // A permission failure is safe to skip: the provider runs as this same
      // user, so a directory this process may not open is one the provider may
      // not open either. Any OTHER error — EMFILE, EIO, ENOTDIR — says the
      // sweep failed, not that the subtree is unreachable, and the child gets
      // a fresh descriptor table of its own. Refuse rather than report a
      // subtree as clean because reading it happened to fail here.
      if (e.code === 'EACCES' || e.code === 'EPERM') continue;
      return {
        code: EXIT.PRIVACY,
        message:
          `cannot sweep "${rel || '.'}" under scope root "${root}" for denied paths ` +
          `(${e.code || e.message}); refusing to expose a tree that was not fully checked`,
      };
    }
    for (const entry of entries) {
      if (++seen > maxEntries) {
        return {
          code: EXIT.PRIVACY,
          message:
            `scope root "${root}" has more than ${maxEntries} entries, so it cannot be swept for ` +
            'denied paths before being exposed; narrow scope.root or use advisory mode',
        };
      }
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;

      // Deny-check the name the entry presents, whatever kind of entry it is.
      const denied = matchesDenyGlob(childRel);
      if (denied) {
        return {
          code: EXIT.PRIVACY,
          message:
            `scope root "${root}" contains "${childRel}", which matches the deny pattern "${denied}"; ` +
            'the provider would be able to read it directly in this mode',
        };
      }

      // A symlink is checked by NAME above and by TARGET here. Dirent reports
      // it as neither a file nor a directory, so without this branch a link
      // called `notes.txt` pointing at `.env` — or at anything outside the
      // root — would pass the sweep untouched and then be followed by the
      // provider, which is handed the root and reads it with its own tools.
      if (entry.isSymbolicLink()) {
        const linkPath = path.join(realRoot, childRel);
        let target;
        try {
          target = fs.realpathSync(linkPath);
        } catch (e) {
          // Fail closed, as gateContext does for an unreadable scope.files
          // entry: a link this process cannot resolve is a link whose target
          // it cannot vouch for.
          return {
            code: EXIT.PRIVACY,
            message: `scope root "${root}" contains symlink "${childRel}" that cannot be resolved: ${e.code || e.message}`,
          };
        }
        if (target !== realRoot && !target.startsWith(realRoot + path.sep)) {
          return {
            code: EXIT.PRIVACY,
            message:
              `scope root "${root}" contains symlink "${childRel}" pointing outside it; ` +
              'the provider would follow it straight past the scope boundary',
          };
        }
        const targetRel = path.relative(realRoot, target).split(path.sep).join('/');
        const targetDenied = targetRel && matchesDenyGlob(targetRel);
        if (targetDenied) {
          return {
            code: EXIT.PRIVACY,
            message:
              `scope root "${root}" contains symlink "${childRel}" pointing at "${targetRel}", ` +
              `which matches the deny pattern "${targetDenied}"`,
          };
        }
        // The target lives inside the root, so the walk reaches it by its real
        // path anyway. Not descending here also makes a symlink cycle a
        // non-event.
        continue;
      }

      if (entry.isDirectory()) {
        if (!SWEEP_SKIP_DIRS.has(entry.name)) stack.push(childRel);
        continue;
      }
    }
  }
  return null;
}

// The cap gateContext applies is a sum of the inputs, which is what makes it
// checkable before anything is read twice — but it is not what leaves the
// machine. The prompt buildPrompt renders adds the specialist profile, the
// mode contract, headings, fences and file paths on top, and a task made of
// many empty files can report almost no input bytes while producing a
// document far past the advertised limit. Measure the thing actually sent.
export function gatePromptSize(prompt, defaults = {}) {
  const maxBytes = defaults.max_context_bytes ?? DEFAULT_MAX_CONTEXT_BYTES;
  const bytes = Buffer.byteLength(String(prompt ?? ''), 'utf8');
  if (bytes <= maxBytes) return null;
  return {
    code: EXIT.PRIVACY,
    message:
      `the rendered prompt is ${bytes} bytes, over defaults.max_context_bytes (${maxBytes}); ` +
      'narrow scope.files or shorten the task envelope',
  };
}

// Read every declared file, enforce the deny list, sweep for secrets, and cap
// total size. Returns the material the prompt builder will use, so nothing is
// read twice and nothing unscanned can reach a provider.
export function gateContext(
  task,
  defaults = {},
  scopeRoot = process.cwd(),
  { mode = 'advisory', specialistInstructions = '' } = {},
) {
  const maxBytes = defaults.max_context_bytes ?? DEFAULT_MAX_CONTEXT_BYTES;
  // Only advisory inlines file contents into the prompt. In the
  // repository-visible modes buildPrompt emits paths and the provider reads
  // the tree itself, so counting those contents against the cap would reject a
  // run over bytes that are never sent, and report them in
  // `context_sent.bytes` as if they had been. The contents are still read and
  // swept — a secret in an explicitly declared file is worth refusing over
  // whichever mode is running — they just are not billed to the cap.
  const inlinesFileContents = mode === 'advisory';
  const root = path.resolve(scopeRoot);
  const declared = task?.scope?.files ?? [];
  // A string here would iterate character by character and turn one declared
  // path into a dozen unrelated ones; anything else non-iterable would throw a
  // raw TypeError out of the gate that exists to fail closed.
  if (!Array.isArray(declared)) {
    throw new GateError(EXIT.PRIVACY, 'scope.files must be an array of paths');
  }
  const files = [];
  let totalBytes = 0;

  // Realpath the root once. On macOS /tmp (and /var) is itself a symlink, so
  // comparing a realpath'd file against a non-realpath'd root would produce
  // false "outside the scope root" rejections.
  let realRoot;
  try {
    realRoot = fs.realpathSync(root);
  } catch (e) {
    throw new GateError(EXIT.PRIVACY, `cannot resolve scope root "${scopeRoot}": ${e.code || e.message}`);
  }

  for (const rel of declared) {
    if (typeof rel !== 'string') {
      throw new GateError(EXIT.PRIVACY, `scope.files entry ${JSON.stringify(rel)} must be a string path`);
    }
    // The path itself travels — into the prompt as a heading or a bullet, and
    // into the envelope's context_sent list — so it is sent text and gets the
    // same sweep as sent content. A build artifact named after the key that
    // produced it leaks that key through its filename while its contents scan
    // perfectly clean.
    const pathHits = scanForSecrets(rel);
    if (pathHits.length) {
      throw new GateError(
        EXIT.PRIVACY,
        `secret detected in the scope.files path itself: ${pathHits.map((h) => h.id).join(', ')}`,
      );
    }
    const denied = matchesDenyGlob(rel);
    if (denied) {
      // Abort, never skip. A silent drop would let the agent believe context
      // was sent that was not.
      throw new GateError(
        EXIT.PRIVACY,
        `scope.files includes "${rel}", which matches the deny pattern "${denied}"`,
      );
    }
    const full = path.resolve(root, rel);

    // Syntactic containment first: path.resolve() has already collapsed any
    // ".." segments, so an entry whose resolved path lands outside root is
    // rejected here even if nothing exists at that path yet (e.g.
    // "../../../etc/hosts" landing on a nonexistent nested directory).
    if (full !== root && !full.startsWith(root + path.sep)) {
      throw new GateError(EXIT.PRIVACY, `scope.files entry "${rel}" resolves outside the scope root`);
    }

    // Syntactic containment alone is not enough: it never follows symlinks,
    // but the read below does. A symlink living inside scopeRoot that points
    // outside it would pass the check above and exfiltrate whatever it
    // points to, unscanned by anything but the six regexes in
    // secret-patterns.mjs. Resolve real paths on both sides before trusting
    // the file is actually inside the root.
    let realFull;
    try {
      realFull = fs.realpathSync(full);
    } catch (e) {
      throw new GateError(EXIT.PRIVACY, `cannot read scope.files entry "${rel}": ${e.code || e.message}`);
    }
    if (realFull !== realRoot && !realFull.startsWith(realRoot + path.sep)) {
      throw new GateError(EXIT.PRIVACY, `scope.files entry "${rel}" resolves outside the scope root`);
    }

    // Decide from metadata whether this file may be read at all. Reading
    // first and checking the cap afterwards means a multi-gigabyte log named
    // in scope.files is fully resident in memory before anything objects to
    // it — the cap cannot protect the process it is loaded into.
    let sizeOnDisk;
    try {
      sizeOnDisk = fs.statSync(full).size;
    } catch (e) {
      throw new GateError(EXIT.PRIVACY, `cannot read scope.files entry "${rel}": ${e.code || e.message}`);
    }

    if (inlinesFileContents && totalBytes + sizeOnDisk > maxBytes) {
      throw new GateError(
        EXIT.PRIVACY,
        `scope.files entry "${rel}" is ${sizeOnDisk} bytes, which takes the context over ` +
          `defaults.max_context_bytes (${maxBytes}); narrow scope.files`,
      );
    }

    let content = null;
    let scanned = true;
    if (!inlinesFileContents && sizeOnDisk > maxBytes) {
      // Repository-visible mode: this file's contents are not sent, only its
      // path. Loading it purely to sweep it would be the same denial of
      // service in a different coat, and the sweep would add nothing the
      // provider cannot already do — it has been handed the whole tree, whose
      // deny list gateRepositoryExposure enforced at the directory boundary.
      // Skip the read and record that it was skipped rather than reporting a
      // clean scan that never ran.
      scanned = false;
    } else {
      try {
        content = fs.readFileSync(full, 'utf8');
      } catch (e) {
        throw new GateError(EXIT.PRIVACY, `cannot read scope.files entry "${rel}": ${e.code || e.message}`);
      }
      const hits = scanForSecrets(content);
      if (hits.length) {
        throw new GateError(
          EXIT.PRIVACY,
          `secret detected in "${rel}": ${hits.map((h) => h.id).join(', ')}`,
        );
      }
    }

    const bytes = content === null ? sizeOnDisk : Buffer.byteLength(content, 'utf8');
    // In a repository-visible mode only the path travels in the prompt, so
    // that is what the cap counts.
    totalBytes += inlinesFileContents ? bytes : Buffer.byteLength(rel, 'utf8');
    files.push({ path: rel, content, bytes, scanned });
  }

  (task?.context?.inline ?? []).forEach((item, i) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new GateError(
        EXIT.PRIVACY,
        `context.inline entry ${JSON.stringify(item)} must be an object`,
      );
    }
    const label = item.label;
    if (label !== undefined && label !== null && typeof label !== 'string') {
      throw new GateError(
        EXIT.PRIVACY,
        `context.inline entry label must be a string`,
      );
    }
    if (label) {
      const labelHits = scanForSecrets(label);
      if (labelHits.length) {
        throw new GateError(
          EXIT.PRIVACY,
          `secret detected in context.inline[${i}].label: ${labelHits.map((h) => h.id).join(', ')}`,
        );
      }
      totalBytes += Buffer.byteLength(label, 'utf8');
    }
    const raw = item.content;
    if (raw !== undefined && raw !== null && typeof raw !== 'string') {
      throw new GateError(
        EXIT.PRIVACY,
        `context.inline entry "${item?.label ?? 'unnamed'}" has non-string content`,
      );
    }
    const content = raw ?? '';
    const hits = scanForSecrets(content);
    if (hits.length) {
      throw new GateError(
        EXIT.PRIVACY,
        `secret detected in context.inline[${i}].content: ${hits.map((h) => h.id).join(', ')}`,
      );
    }
    totalBytes += Buffer.byteLength(content, 'utf8');
  });

  const summary = task?.context?.summary ?? '';
  if (summary !== '' && typeof summary !== 'string') {
    throw new GateError(EXIT.PRIVACY, 'context.summary must be a string');
  }
  const summaryHits = scanForSecrets(summary);
  if (summaryHits.length) {
    throw new GateError(
      EXIT.PRIVACY,
      `secret detected in context.summary: ${summaryHits.map((h) => h.id).join(', ')}`,
    );
  }
  // Counted toward the cap like every other source above — a huge summary
  // must not slip through for free just because it isn't a file or an
  // inline block.
  totalBytes += Buffer.byteLength(summary, 'utf8');

  // The envelope's free-text planning fields (objective, constraints,
  // out_of_scope, acceptance_criteria) are not scope.files or context.*, but
  // the prompt builder puts all of them into the outgoing prompt verbatim.
  // gateContext is the single scan-and-count choke point by design, so they
  // must pass through it too, not reach the provider unscanned.
  // The specialist profile is markdown from disk, not from the task envelope,
  // but buildPrompt puts it at the very top of the outgoing prompt — so it is
  // text sent to the provider, and this function is where sent text gets
  // swept. A profile is installed or hand-written; a credential pasted into
  // one as an example must not ride out on every run that uses it.
  for (const [field, value] of [
    ['specialist instructions', specialistInstructions],
    ['objective', task?.objective],
    ['expected_output', task?.expected_output],
  ]) {
    const text = value ?? '';
    if (text !== '' && typeof text !== 'string') {
      throw new GateError(EXIT.PRIVACY, `${field} must be a string`);
    }
    const hits = scanForSecrets(text);
    if (hits.length) {
      throw new GateError(
        EXIT.PRIVACY,
        `secret detected in ${field}: ${hits.map((h) => h.id).join(', ')}`,
      );
    }
    totalBytes += Buffer.byteLength(text, 'utf8');
  }

  for (const [field, arr] of [
    ['constraints', task?.constraints],
    ['out_of_scope', task?.out_of_scope],
    ['acceptance_criteria', task?.acceptance_criteria],
  ]) {
    if (arr !== undefined && !Array.isArray(arr)) {
      throw new GateError(EXIT.PRIVACY, `${field} must be an array of strings`);
    }
    (arr ?? []).forEach((entry, i) => {
      if (typeof entry !== 'string') {
        throw new GateError(EXIT.PRIVACY, `${field}[${i}] must be a string`);
      }
      const entryHits = scanForSecrets(entry);
      if (entryHits.length) {
        throw new GateError(
          EXIT.PRIVACY,
          `secret detected in ${field}[${i}]: ${entryHits.map((h) => h.id).join(', ')}`,
        );
      }
      totalBytes += Buffer.byteLength(entry, 'utf8');
    });
  }

  if (totalBytes > maxBytes) {
    throw new GateError(
      EXIT.PRIVACY,
      `context is ${totalBytes} bytes, over defaults.max_context_bytes (${maxBytes}); narrow scope.files`,
    );
  }

  return { files, totalBytes };
}
