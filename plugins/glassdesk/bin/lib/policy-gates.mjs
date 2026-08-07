// Policy enforcement. Every gate fails closed: input it cannot evaluate is
// rejected rather than waved through.

import fs from 'node:fs';
import path from 'node:path';
import { EXIT } from './exit-codes.mjs';
import { matchesDenyGlob, scanForSecrets } from './secret-patterns.mjs';

const CLASSIFICATIONS = ['public', 'internal', 'confidential', 'restricted'];
const DEFAULT_MAX_CONTEXT_BYTES = 400000;

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

// Read every declared file, enforce the deny list, sweep for secrets, and cap
// total size. Returns the material the prompt builder will use, so nothing is
// read twice and nothing unscanned can reach a provider.
export function gateContext(task, defaults = {}, scopeRoot = process.cwd()) {
  const maxBytes = defaults.max_context_bytes ?? DEFAULT_MAX_CONTEXT_BYTES;
  const root = path.resolve(scopeRoot);
  const declared = task?.scope?.files ?? [];
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

    let content;
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
    const bytes = Buffer.byteLength(content, 'utf8');
    totalBytes += bytes;
    files.push({ path: rel, content, bytes });
  }

  for (const item of task?.context?.inline ?? []) {
    const raw = item?.content;
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
        `secret detected in inline context "${item?.label ?? 'unnamed'}": ${hits.map((h) => h.id).join(', ')}`,
      );
    }
    totalBytes += Buffer.byteLength(content, 'utf8');
  }

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
  const objective = task?.objective ?? '';
  if (objective !== '' && typeof objective !== 'string') {
    throw new GateError(EXIT.PRIVACY, 'objective must be a string');
  }
  const objectiveHits = scanForSecrets(objective);
  if (objectiveHits.length) {
    throw new GateError(
      EXIT.PRIVACY,
      `secret detected in objective: ${objectiveHits.map((h) => h.id).join(', ')}`,
    );
  }
  totalBytes += Buffer.byteLength(objective, 'utf8');

  for (const [field, arr] of [
    ['constraints', task?.constraints],
    ['out_of_scope', task?.out_of_scope],
    ['acceptance_criteria', task?.acceptance_criteria],
  ]) {
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
