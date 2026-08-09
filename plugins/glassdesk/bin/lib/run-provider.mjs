// Provider transport. Two shapes: spawn a CLI, or POST to an
// OpenAI-compatible endpoint. Neither interprets what comes back.

import { spawn } from 'node:child_process';
import { EXIT } from './exit-codes.mjs';
import { isLoopbackHost } from './policy-gates.mjs';

const STDERR_TAIL_CHARS = 4000;
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;
// After the timeout fires the child gets SIGTERM, then this long to exit
// before SIGKILL. Anything that ignores SIGTERM (the measured opencode
// denied-write hang) is killed outright rather than waited on forever.
const KILL_GRACE_MS = 5000;
// SIGKILL cannot force a descendant that inherited the pipes to close them,
// so stop waiting on 'close' shortly after: the advertised timeout has to
// bound wall clock, not merely request it.
const ABANDON_MS = 2000;

// Variables a child genuinely needs: to be launchable, to find its own
// credential store, and to reach the network the way the user's machine does.
// EVERYTHING else in this process's environment is dropped. A Claude Code
// session is routinely started with credentials in its environment, and a
// provider with shell tooling can read its own environment even under a
// read-only sandbox — `...process.env` would hand those over on every run,
// unscanned and unredacted.
export const ENV_ALLOWLIST = [
  'PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL',
  'TMPDIR', 'TMP', 'TEMP',
  'LANG', 'LANGUAGE', 'LC_ALL', 'LC_CTYPE', 'TERM', 'TZ',
  // Proxy and TLS trust: omitting these breaks every provider behind a
  // corporate egress proxy, and none of them is a credential.
  'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY',
  'http_proxy', 'https_proxy', 'no_proxy',
  'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'SSL_CERT_DIR',
  // XDG base dirs relocate a CLI's config/credential store away from ~.
  'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'XDG_STATE_HOME',
  // Windows: a process cannot start without these.
  'SystemRoot', 'SystemDrive', 'COMSPEC', 'PATHEXT',
  'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'PROGRAMDATA',
];

// The allowlist plus whatever the registry entry declares it needs, plus the
// invoke template's own env — which is policy the dispatcher is imposing, not
// inherited state, so it always wins.
export function buildChildEnv(provider, injected = {}, source = process.env) {
  const out = {};
  for (const key of [...ENV_ALLOWLIST, ...(provider?.env_passthrough ?? [])]) {
    if (typeof key !== 'string') continue;
    if (source[key] !== undefined) out[key] = source[key];
  }
  return { ...out, ...injected };
}

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

// Map a provider's own exit status onto this contract's codes.
//
// `raw` tracks whether `exitCode` ends up being the *provider's own* status,
// passed straight through, as opposed to a code this function assigned itself
// (timeout, auth-pattern match, or the FAILURE fallback used when the child
// left no exit status at all, e.g. killed by a signal this function did not
// request). The provider's own exit codes are an arbitrary namespace it does
// not coordinate with ours — a provider that happens to exit 13 must not be
// reported as EXIT.PRIVACY. Only the dispatcher-assigned codes are safe for a
// caller to treat as this contract's reserved values; the raw flag is how the
// caller tells them apart without re-deriving this logic itself.
function classifyExit(provider, status, stderr) {
  let exitCode = status ?? EXIT.FAILURE;
  let raw = status !== null && status !== undefined;
  if (exitCode !== 0 && provider.auth_error_pattern) {
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
    if (re && re.test(stderr)) {
      exitCode = EXIT.AUTH;
      raw = false;
    }
  }
  return { exitCode, raw };
}

// Async by necessity, not preference. spawnSync's `timeout` sends a signal and
// then keeps waiting for the child to die, so a provider that ignores SIGTERM
// — or that leaves a descendant holding the inherited pipes open — hangs past
// the advertised hard timeout, which is the exact failure this dispatcher was
// built to bound. Enforcing a timeout properly needs a watchdog running
// alongside the child, and that cannot exist in a synchronous call.
export function runCli(provider, name, { argv, env }, timeoutMs, { cwd, killGraceMs = KILL_GRACE_MS } = {}) {
  return new Promise((resolve) => {
    // A new process group, so the watchdog can signal the provider's whole
    // descendant tree (`kill(-pgid)`) rather than only the process this
    // dispatcher spawned. Windows has no process groups to detach into; there
    // `detached` merely opens a new console, so it is not requested.
    const ownGroup = process.platform !== 'win32';

    let child;
    try {
      child = spawn(provider.bin, argv, {
        cwd: cwd || process.cwd(),
        env: buildChildEnv(provider, env),
        // No shell. argv elements reach the process verbatim.
        shell: false,
        detached: ownGroup,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (e) {
      resolve({
        exitCode: e.code === 'ENOENT' ? EXIT.UNAVAILABLE : EXIT.FAILURE,
        stdout: '',
        stderr: e.code === 'ENOENT' ? `${provider.bin}: not found` : String(e.message),
        timedOut: false,
        raw: false,
      });
      return;
    }

    let stdout = '';
    let stderr = '';
    let outBytes = 0;
    let overflowed = false;
    let timedOut = false;
    let settled = false;
    let graceTimer = null;
    let abandonTimer = null;

    const killTree = (signal) => {
      try {
        if (ownGroup && child.pid) process.kill(-child.pid, signal);
        else child.kill(signal);
      } catch {
        /* already gone, or the group outlived its leader — nothing to do */
      }
    };

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(graceTimer);
      clearTimeout(abandonTimer);
      resolve(result);
    };

    const finishFromChild = (status) => {
      if (overflowed) {
        finish({
          exitCode: EXIT.FAILURE,
          stdout,
          // The old spawnSync path surfaced this as an ENOBUFS error; keep the
          // token so the failure stays greppable and is never read as a timeout.
          stderr: `${stderr}\nexternal-ai: provider wrote more than ${MAX_OUTPUT_BYTES} bytes to stdout (ENOBUFS)`,
          timedOut: false,
          raw: false,
        });
        return;
      }
      if (timedOut) {
        // The leader can exit on SIGTERM while a descendant that traps it
        // survives — and if that descendant redirected or closed the inherited
        // stdio, 'close' fires here immediately, cancelling the grace timer
        // before its SIGKILL ever ran. Deliver the final kill to the group now,
        // synchronously, so a timed-out run never settles with a member of its
        // own process group still alive.
        killTree('SIGKILL');
        finish({ exitCode: EXIT.TIMEOUT, stdout, stderr, timedOut: true, raw: false });
        return;
      }
      const { exitCode, raw } = classifyExit(provider, status, stderr);
      finish({ exitCode, stdout, stderr, timedOut: false, raw });
    };

    const timer = setTimeout(() => {
      timedOut = true;
      killTree('SIGTERM');
      graceTimer = setTimeout(() => {
        killTree('SIGKILL');
        abandonTimer = setTimeout(() => finishFromChild(null), ABANDON_MS);
      }, killGraceMs);
    }, timeoutMs);

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      if (overflowed) return;
      outBytes += Buffer.byteLength(chunk, 'utf8');
      if (outBytes > MAX_OUTPUT_BYTES) {
        // Cap what is held in memory, and stop the producer immediately —
        // there is no point paying for output that will be discarded.
        overflowed = true;
        killTree('SIGKILL');
        return;
      }
      stdout += chunk;
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      // Only the tail ever reaches the envelope, so there is no reason to
      // accumulate an unbounded amount of it.
      if (stderr.length > STDERR_TAIL_CHARS * 4) {
        stderr = stderr.slice(-STDERR_TAIL_CHARS * 2);
      }
      stderr += chunk;
    });

    child.on('error', (e) => {
      finish({
        exitCode: e.code === 'ENOENT' ? EXIT.UNAVAILABLE : EXIT.FAILURE,
        stdout: '',
        stderr: e.code === 'ENOENT' ? `${provider.bin}: not found` : String(e.message),
        timedOut: false,
        raw: false,
      });
    });

    // 'close' rather than 'exit': it fires once the child has exited AND its
    // stdio has been fully drained, so no trailing output is dropped.
    child.on('close', (status) => finishFromChild(status));
  });
}

// `res.text()` buffers the whole body before anything gets a chance to
// truncate it, so a malformed or hostile endpoint can exhaust this process
// with a single reply — the 64 MB ceiling that bounds a CLI provider's stdout
// has to bound an HTTP body too. Read incrementally and stop at the cap.
async function readCappedBody(res, maxBytes) {
  if (!res.body) return { text: await res.text(), truncated: false };
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      try {
        await reader.cancel();
      } catch {
        /* the socket is being torn down anyway */
      }
      return { text: '', truncated: true };
    }
    chunks.push(Buffer.from(value));
  }
  return { text: Buffer.concat(chunks).toString('utf8'), truncated: false };
}

export async function runHttp(provider, prompt, timeoutMs, { maxBodyBytes = MAX_OUTPUT_BYTES } = {}) {
  const envMap = provider.env || {};
  const defaults = provider.endpoint_defaults || {};
  const baseUrl = (process.env[envMap.base_url] || defaults.base_url || '').replace(/\/+$/, '');
  const apiKey = process.env[envMap.api_key] || '';
  const model = process.env[envMap.model] || defaults.model || '';

  if (!baseUrl) {
    return { exitCode: EXIT.UNAVAILABLE, stdout: '', stderr: `${envMap.base_url} is not set`, timedOut: false, raw: false, apiKey };
  }

  // Defence in depth. gateEndpoint already refused a local-only provider whose
  // base URL is not loopback, but this function is exported and the URL comes
  // from an environment variable — the last thing that touches the socket
  // re-checks rather than trusts a gate it cannot see.
  if (provider.privacy?.execution === 'local-only' || provider.privacy?.restricted_data_allowed === true) {
    let host = null;
    try {
      host = new URL(baseUrl).hostname;
    } catch {
      host = null;
    }
    if (!isLoopbackHost(host)) {
      return {
        exitCode: EXIT.PRIVACY,
        stdout: '',
        stderr: `${envMap.base_url} points at "${baseUrl}", which is not a loopback address; this provider is declared local-only`,
        timedOut: false,
        raw: false,
        apiKey,
      };
    }
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

    const { text, truncated } = await readCappedBody(res, maxBodyBytes);
    if (truncated) {
      return {
        exitCode: EXIT.FAILURE,
        stdout: '',
        stderr: `response body exceeded ${maxBodyBytes} bytes and was discarded (ENOBUFS)`,
        timedOut: false,
        raw: false,
        apiKey,
      };
    }
    if (res.status === 401 || res.status === 403) {
      return { exitCode: EXIT.AUTH, stdout: '', stderr: `HTTP ${res.status}: ${text}`, timedOut: false, raw: false, apiKey };
    }
    if (!res.ok) {
      // A 429 or a 5xx is the provider running and failing, not the dispatcher
      // failing — exit 20 is reserved for the latter. Preserve the HTTP status
      // as the envelope's exit_code and flag it raw, so cmdRun collapses the
      // process exit to 1 exactly as it does for a CLI provider's own status.
      return { exitCode: res.status, stdout: '', stderr: `HTTP ${res.status}: ${text}`, timedOut: false, raw: true, apiKey };
    }

    let content = text;
    try {
      const json = JSON.parse(text);
      content = json.choices?.[0]?.message?.content ?? text;
    } catch {
      /* a non-JSON 200 is passed through verbatim for the agent to judge */
    }
    return { exitCode: EXIT.OK, stdout: content, stderr: '', timedOut: false, raw: false, apiKey };
  } catch (e) {
    if (e.name === 'AbortError') {
      return { exitCode: EXIT.TIMEOUT, stdout: '', stderr: 'request aborted after timeout', timedOut: true, raw: false, apiKey };
    }
    // A transport-level throw (DNS, TLS, connection refused) never reached the
    // provider, so this one really is a dispatcher-side failure.
    return { exitCode: EXIT.FAILURE, stdout: '', stderr: String(e.message), timedOut: false, raw: false, apiKey };
  } finally {
    clearTimeout(timer);
  }
}

export function buildEnvelope({
  provider, specialist = null, mode, exitCode, durationMs = 0,
  command = '', files = [], totalBytes = 0, stdout = '', stderr = '', timedOut = false,
  secrets = [], repositoryRoot = null,
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
    // `repository_root` is non-null exactly when the provider was given a
    // directory it can read for itself. Without it, `files`/`bytes` read as
    // the complete list of what the provider could see — which is true in
    // advisory mode and false in every repository-visible mode, where those
    // two fields describe only what was *pushed* into the prompt.
    context_sent: {
      files: files.map((f) => f.path),
      bytes: totalBytes,
      repository_root: repositoryRoot,
    },
    raw_output: redact(stdout, secrets),
    stderr_tail: redact(String(stderr).slice(-STDERR_TAIL_CHARS), secrets),
  };
}
