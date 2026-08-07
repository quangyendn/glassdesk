// Provider transport. Two shapes: spawn a CLI, or POST to an
// OpenAI-compatible endpoint. Neither interprets what comes back.

import { spawnSync } from 'node:child_process';
import { EXIT } from './exit-codes.mjs';

const STDERR_TAIL_CHARS = 4000;

// Substitute {model} / {prompt} / {dir} / {policy} into the registry's argv
// template. Substitution is per-element, so a value containing shell
// metacharacters stays one argument — there is no shell involved at any point.
export function buildArgv(provider, mode, subs) {
  const spec = provider.invoke?.[mode];
  if (!spec) {
    throw new Error(`provider has no invoke template for mode "${mode}"`);
  }
  const policyJson = spec.policy ? JSON.stringify(spec.policy) : '';
  const table = {
    '{model}': subs.model ?? provider.default_model ?? '',
    '{prompt}': subs.prompt ?? '',
    '{dir}': subs.dir ?? process.cwd(),
    '{policy}': policyJson,
  };
  const sub = (s) => (Object.prototype.hasOwnProperty.call(table, s) ? table[s] : s);

  const argv = (spec.argv || []).map(sub);
  const env = {};
  for (const [k, v] of Object.entries(spec.env || {})) {
    env[k] = sub(v);
  }
  return { argv, env };
}

// Guarantee: exact occurrences of each secret's literal form, its
// URL-encoded form, and its base64 form (each only when at least 4
// characters) are replaced with `***`. Any other transformation of the
// secret — re-wrapping, partial encoding, a different base64 alphabet,
// splitting across a boundary — is NOT detected. This is deliberately
// narrow: URL-encoding and base64 are the two transforms that actually
// occur in HTTP plumbing (query strings / headers, and Basic-auth-style
// encoding), not a general defense against an adversarial re-encoding.
export function redact(text, secrets = []) {
  let out = String(text ?? '');
  for (const s of secrets) {
    if (!s || typeof s !== 'string' || s.length < 4) continue;
    const variants = new Set([s]);
    try {
      variants.add(encodeURIComponent(s));
    } catch {
      /* not URL-encodable; skip that variant */
    }
    try {
      variants.add(Buffer.from(s, 'utf8').toString('base64'));
    } catch {
      /* not base64-encodable; skip that variant */
    }
    for (const v of variants) {
      if (!v || v.length < 4) continue;
      out = out.split(v).join('***');
    }
  }
  return out;
}

export function runCli(provider, name, { argv, env }, timeoutMs) {
  const r = spawnSync(provider.bin, argv, {
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, ...env },
    // No shell. argv elements reach the process verbatim.
    shell: false,
  });

  if (r.error) {
    // spawnSync surfaces a hard timeout and a missing binary the same way
    // Node reports any other spawn failure: via `r.error`. Distinguish them
    // explicitly rather than inferring from the signal, which is ambiguous
    // (a maxBuffer overflow or a self-terminating child also produce
    // `signal: 'SIGTERM', status: null` with no `r.error` set).
    if (r.error.code === 'ETIMEDOUT') {
      return { exitCode: EXIT.TIMEOUT, stdout: r.stdout ?? '', stderr: r.stderr ?? '', timedOut: true };
    }
    if (r.error.code === 'ENOENT') {
      return { exitCode: EXIT.UNAVAILABLE, stdout: '', stderr: `${provider.bin}: not found`, timedOut: false };
    }
    return { exitCode: EXIT.FAILURE, stdout: r.stdout ?? '', stderr: String(r.error.message), timedOut: false };
  }

  // No `r.error` means spawnSync itself didn't fail to launch/manage the
  // child, but the child can still have been killed by a signal (e.g. this
  // timeout heuristic, or a self-sent SIGTERM) — check that case here, not
  // above, so it never shadows a real ENOBUFS/ENOENT.
  const timedOut = r.signal === 'SIGTERM' && r.status === null;

  const stderr = r.stderr ?? '';
  let exitCode = r.status ?? EXIT.FAILURE;
  if (timedOut) {
    exitCode = EXIT.TIMEOUT;
  } else if (exitCode !== 0 && provider.auth_error_pattern) {
    // A CLI's session state cannot be probed for free, so authentication
    // failure is recognised here, from what it printed. A malformed pattern
    // in the registry (e.g. an unbalanced paren) must degrade to "use the
    // provider's own exit code", not crash the dispatcher.
    let re = null;
    try {
      re = new RegExp(provider.auth_error_pattern, 'i');
    } catch {
      re = null;
    }
    if (re && re.test(stderr)) exitCode = EXIT.AUTH;
  }

  return { exitCode, stdout: r.stdout ?? '', stderr, timedOut };
}

export async function runHttp(provider, prompt, timeoutMs) {
  const envMap = provider.env || {};
  const defaults = provider.endpoint_defaults || {};
  const baseUrl = (process.env[envMap.base_url] || defaults.base_url || '').replace(/\/+$/, '');
  const apiKey = process.env[envMap.api_key] || '';
  const model = process.env[envMap.model] || defaults.model || '';

  if (!baseUrl) {
    return { exitCode: EXIT.UNAVAILABLE, stdout: '', stderr: `${envMap.base_url} is not set`, timedOut: false, apiKey };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }] }),
      signal: controller.signal,
    });

    const text = await res.text();
    if (res.status === 401 || res.status === 403) {
      return { exitCode: EXIT.AUTH, stdout: '', stderr: `HTTP ${res.status}: ${text}`, timedOut: false, apiKey };
    }
    if (!res.ok) {
      return { exitCode: EXIT.FAILURE, stdout: '', stderr: `HTTP ${res.status}: ${text}`, timedOut: false, apiKey };
    }

    let content = text;
    try {
      const json = JSON.parse(text);
      content = json.choices?.[0]?.message?.content ?? text;
    } catch {
      /* a non-JSON 200 is passed through verbatim for the agent to judge */
    }
    return { exitCode: EXIT.OK, stdout: content, stderr: '', timedOut: false, apiKey };
  } catch (e) {
    if (e.name === 'AbortError') {
      return { exitCode: EXIT.TIMEOUT, stdout: '', stderr: 'request aborted after timeout', timedOut: true, apiKey };
    }
    return { exitCode: EXIT.FAILURE, stdout: '', stderr: String(e.message), timedOut: false, apiKey };
  } finally {
    clearTimeout(timer);
  }
}

export function buildEnvelope({
  provider, specialist = null, mode, exitCode, durationMs = 0,
  command = '', files = [], totalBytes = 0, stdout = '', stderr = '', timedOut = false,
  secrets = [],
}) {
  let status = 'completed';
  if (timedOut) status = 'timeout';
  else if (exitCode !== 0) status = 'failed';

  // Redaction happens here, not just at the call site — a caller that
  // forgets to redact before building the envelope must not be able to leak
  // a secret into it. Redacting text that's already been redacted is a
  // no-op, so a caller that also redacts beforehand is unaffected.
  return {
    version: 'external-ai-run-v1',
    provider,
    specialist,
    mode,
    status,
    exit_code: exitCode,
    duration_ms: durationMs,
    command: redact(command, secrets),
    context_sent: { files: files.map((f) => f.path), bytes: totalBytes },
    raw_output: redact(stdout, secrets),
    stderr_tail: redact(String(stderr).slice(-STDERR_TAIL_CHARS), secrets),
  };
}
