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

  for (const rel of declared) {
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
    if (full !== root && !full.startsWith(root + path.sep)) {
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
    const hits = scanForSecrets(item.content ?? '');
    if (hits.length) {
      throw new GateError(
        EXIT.PRIVACY,
        `secret detected in inline context "${item.label ?? 'unnamed'}": ${hits.map((h) => h.id).join(', ')}`,
      );
    }
    totalBytes += Buffer.byteLength(item.content ?? '', 'utf8');
  }

  const summaryHits = scanForSecrets(task?.context?.summary ?? '');
  if (summaryHits.length) {
    throw new GateError(
      EXIT.PRIVACY,
      `secret detected in context.summary: ${summaryHits.map((h) => h.id).join(', ')}`,
    );
  }

  if (totalBytes > maxBytes) {
    throw new GateError(
      EXIT.PRIVACY,
      `context is ${totalBytes} bytes, over defaults.max_context_bytes (${maxBytes}); narrow scope.files`,
    );
  }

  return { files, totalBytes };
}
