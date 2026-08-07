// Availability and authentication probing. Never spawns a provider — probing
// must stay free, because `list` runs it for every entry on every call.

import fs from 'node:fs';
import path from 'node:path';
import { EXIT } from './exit-codes.mjs';

// PATH lookup without a shell, so PATH can be scoped in tests and nothing is
// interpolated into a command line.
export function which(bin) {
  if (!bin) return null;
  const exts = process.platform === 'win32'
    ? (process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';')
    : [''];
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = path.join(dir, bin + ext);
      try {
        fs.accessSync(candidate, fs.constants.X_OK);
        return candidate;
      } catch {
        /* keep looking */
      }
    }
  }
  return null;
}

function unavailable(name, provider, reason) {
  return { name, type: provider.type, available: false, code: EXIT.UNAVAILABLE, reason, detail: null };
}

function needsAuth(name, provider, reason) {
  return { name, type: provider.type, available: false, code: EXIT.AUTH, reason, detail: null };
}

export function probeProvider(name, provider) {
  if (provider.enabled === false) {
    return unavailable(name, provider, 'disabled in the registry (enabled: false)');
  }

  if (provider.type === 'cli-agent') {
    const resolved = which(provider.bin);
    if (!resolved) {
      return unavailable(name, provider, `\`${provider.bin}\` is not on PATH`);
    }
    // A CLI's session state cannot be probed for free. Authentication failure
    // surfaces at run time and is mapped to EXIT.AUTH via auth_error_pattern.
    return { name, type: provider.type, available: true, code: EXIT.OK, reason: null, detail: resolved };
  }

  if (provider.type === 'openai-compatible') {
    const envMap = provider.env || {};
    const baseUrl = process.env[envMap.base_url];
    if (!baseUrl) {
      // endpoint_defaults exist so a configured user need not retype the URL.
      // They deliberately do NOT imply availability — otherwise every shipped
      // entry would advertise itself as ready.
      return unavailable(name, provider, `${envMap.base_url} is not set`);
    }
    const localOnly = provider.privacy?.execution === 'local-only';
    const apiKey = process.env[envMap.api_key];
    if (!apiKey && !localOnly) {
      return needsAuth(name, provider, `${envMap.api_key} is not set`);
    }
    return { name, type: provider.type, available: true, code: EXIT.OK, reason: null, detail: baseUrl };
  }

  return unavailable(name, provider, `unknown provider type "${provider.type}"`);
}

export function probeAll(registry) {
  return Object.entries(registry.providers)
    .sort((a, b) => (a[1].priority ?? 999) - (b[1].priority ?? 999))
    .map(([name, provider]) => ({ ...probeProvider(name, provider), priority: provider.priority ?? 999 }));
}
