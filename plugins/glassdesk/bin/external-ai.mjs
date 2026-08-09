#!/usr/bin/env node
// external-ai — the single governed path from Claude Code to a non-Claude
// AI provider.
//
// This script owns POLICY and TRANSPORT: availability, authentication,
// privacy classification, secret preflight, timeout, exit codes. It does not
// interpret provider output — that is gd-external-delegate's job, because
// judging a finding's severity needs a model, not a script.
//
// Must stay .mjs: after `npx glassdesk init` the nearest package.json is the
// user's project, which may be CommonJS or absent.
//
//   external-ai.mjs list [--json]
//   external-ai.mjs check --provider <name> [--mode <mode>]
//   external-ai.mjs run --provider <name|auto> [--specialist <name>]
//                       [--mode <mode>] --task-file <path>
//                       [--timeout <seconds>] [--output <path>]

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadRegistry, loadSpecialist } from './lib/load-config.mjs';
import { EXIT } from './lib/exit-codes.mjs';
import { probeProvider, probeAll } from './lib/provider-availability.mjs';
import {
  gateMode, gateCapability, gatePrivacy, gateEndpoint, gateRepositoryExposure, gateContext,
  GateError, REPOSITORY_VISIBLE_MODES,
} from './lib/policy-gates.mjs';
import { buildPrompt } from './lib/build-prompt.mjs';
import { buildArgv, runCli, runHttp, buildEnvelope } from './lib/run-provider.mjs';

const USAGE = `usage:
  external-ai.mjs list [--json]
  external-ai.mjs check --provider <name> [--mode <mode>] [--task-type <type>]
  external-ai.mjs run --provider <name|auto> [--specialist <name>] [--mode <mode>]
                      --task-file <path> [--timeout <seconds>] [--output <path>]

--output must not already exist — a dangling symlink counts as existing —
or the run is refused with exit 12 before (or, on a race, after) the
provider is spawned. Pass a path that does not yet exist, e.g.
"$(mktemp -u)" or a name under "$(mktemp -d)", not "$(mktemp)" itself.

exit codes: 0 ok · 1 provider ran and failed (see envelope.exit_code for its
true status) · 10 unavailable · 11 auth · 12 unsupported · 13 privacy ·
14 timeout · 20 failure`;

function die(code, message) {
  process.stderr.write(`external-ai: ${message}\n`);
  process.exit(code);
}

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  const flags = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = rest[i + 1];
    if (next === undefined || next.startsWith('--')) {
      flags[key] = true;
    } else {
      flags[key] = next;
      i++;
    }
  }
  return { command, flags };
}

// A flag followed by nothing, or by another --flag, parses as boolean true.
// Treating that as "absent" silently drops what the caller asked for, so
// every value-bearing flag must reject it.
export function flagValue(flags, name, { required = false, fallback = undefined } = {}) {
  const v = flags[name];
  if (v === true) die(EXIT.UNSUPPORTED, `--${name} requires a value`);
  if (v === undefined || v === '') {
    if (required) die(EXIT.UNSUPPORTED, `--${name} is required`);
    return fallback;
  }
  return v;
}

function cmdList(registry, flags) {
  const probes = probeAll(registry);
  const providers = probes.map((p) => {
    const entry = registry.providers[p.name];
    return {
      name: p.name,
      type: p.type,
      available: p.available,
      code: p.code,
      reason: p.reason,
      priority: p.priority,
      modes: entry.modes || [],
      capabilities: entry.capabilities || [],
      privacy: entry.privacy || {},
      cost: entry.cost ?? null,
      latency: entry.latency ?? null,
      notes: entry.notes ?? null,
    };
  });

  if (flags.json) {
    process.stdout.write(
      `${JSON.stringify({ version: 'external-ai-list-v1', providers }, null, 2)}\n`,
    );
    return EXIT.OK;
  }

  for (const p of providers) {
    const mark = p.available ? 'ready' : `unavailable (${p.reason})`;
    process.stdout.write(`${p.name.padEnd(14)} ${p.type.padEnd(19)} ${mark}\n`);
    process.stdout.write(`${''.padEnd(14)} modes: ${p.modes.join(', ')}\n`);
  }
  return EXIT.OK;
}

function resolveProvider(registry, name) {
  const entry = registry.providers[name];
  if (!entry) die(EXIT.UNSUPPORTED, `unknown provider "${name}"`);
  return entry;
}

function cmdCheck(registry, flags) {
  const name = flagValue(flags, 'provider', { required: true });
  const entry = resolveProvider(registry, name);

  const probe = probeProvider(name, entry);
  if (!probe.available) die(probe.code, `${name}: ${probe.reason}`);

  const mode = flagValue(flags, 'mode', { fallback: registry.defaults?.mode ?? 'advisory' });
  const modeGate = gateMode(entry, mode);
  if (modeGate) die(modeGate.code, `${name}: ${modeGate.message}`);

  const taskType = flagValue(flags, 'task-type');
  if (taskType !== undefined) {
    const capGate = gateCapability(entry, taskType);
    if (capGate) die(capGate.code, `${name}: ${capGate.message}`);
  }

  // `check` exists so the agent can find out whether a run would be refused
  // without paying for it, so it must apply every gate a run applies that does
  // not need the task file.
  const endpointGate = gateEndpoint(entry);
  if (endpointGate) die(endpointGate.code, `${name}: ${endpointGate.message}`);

  process.stdout.write(`${name}: ready for mode "${mode}"\n`);
  return EXIT.OK;
}

function readTaskFile(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    die(EXIT.FAILURE, `cannot read --task-file ${file}: ${e.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    die(EXIT.FAILURE, `--task-file ${file} is not valid JSON: ${e.message}`);
  }
}

// spawnSync's own `timeout` validation throws a raw RangeError for NaN/negative
// values, and silently disables the timeout altogether for zero — neither
// outcome is acceptable here (the whole feature exists partly because a
// provider was measured hanging past 2m30s). Reject anything that is not a
// finite, positive number of seconds before it ever reaches spawnSync.
function parseTimeoutSeconds(raw) {
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    die(EXIT.UNSUPPORTED, `--timeout must be a positive number of seconds, got "${raw}"`);
  }
  return seconds;
}

// The envelope's `command` field exists so the agent can see what was
// actually invoked — it is not meant to carry the whole prompt a second
// time. Every CLI template embeds `{prompt}` as one argv element, and at the
// 400 KB context cap that element alone can be most of the envelope; joining
// it into `command` verbatim roughly doubles the envelope for no benefit,
// since the same text is already in the prompt that was sent. Replace the
// exact argv element that came from substituting `{prompt}` with a
// byte-length placeholder instead.
function commandLineFor(bin, argv, prompt) {
  const placeholder = `<prompt:${Buffer.byteLength(prompt ?? '', 'utf8')}B>`;
  const sanitizedArgv = argv.map((a) => (a === prompt ? placeholder : a));
  return [bin, ...sanitizedArgv].join(' ');
}

// Deterministic only. Ranking providers on expected quality is a judgment the
// script must not make — the agent calls `list` and passes an explicit name.
function pickAuto(registry, task, mode) {
  for (const probe of probeAll(registry)) {
    if (!probe.available) continue;
    const entry = registry.providers[probe.name];
    if (gateMode(entry, mode)) continue;
    if (gateCapability(entry, task.task_type)) continue;
    if (gatePrivacy(entry, task)) continue;
    // A local-only provider whose endpoint is not actually local must not be
    // silently selected here and then refused two lines later in cmdRun.
    if (gateEndpoint(entry)) continue;
    return probe.name;
  }
  die(EXIT.UNAVAILABLE, `no available provider satisfies mode "${mode}" for this task`);
}

async function cmdRun(registry, flags) {
  const taskFile = flagValue(flags, 'task-file', { required: true });
  const task = readTaskFile(taskFile);
  const mode = flagValue(flags, 'mode', { fallback: registry.defaults?.mode ?? 'advisory' });
  // Validated up front, at parse time, rather than at the point it's finally
  // handed to spawnSync — a bad value should fail fast and cleanly, before any
  // gate has run or any file has been read.
  const timeoutSeconds = parseTimeoutSeconds(
    flagValue(flags, 'timeout', { fallback: registry.defaults?.timeout_seconds ?? 300 }),
  );
  // Also validated up front, alongside --timeout: a provider is expensive and
  // possibly side-effecting to run, so a bad --output must fail before it is
  // spawned, not after — otherwise the run's cost and any side effects are
  // sunk while the envelope that would explain them is discarded on exit.
  const outputFile = flagValue(flags, 'output');
  let resolvedOutputFile = null;
  if (outputFile) {
    resolvedOutputFile = path.resolve(outputFile);
    if (fs.existsSync(resolvedOutputFile)) {
      die(EXIT.UNSUPPORTED, `--output ${outputFile} already exists; refusing to overwrite it`);
    }
  }

  let name = flagValue(flags, 'provider', { required: true });
  if (name === 'auto') name = pickAuto(registry, task, mode);

  const entry = resolveProvider(registry, name);

  const probe = probeProvider(name, entry);
  if (!probe.available) die(probe.code, `${name}: ${probe.reason}`);

  for (const gate of [
    gateMode(entry, mode),
    gateCapability(entry, task.task_type),
    gatePrivacy(entry, task),
    gateEndpoint(entry),
  ]) {
    if (gate) die(gate.code, `${name}: ${gate.message}`);
  }

  let specialist = null;
  const specialistName = flagValue(flags, 'specialist');
  if (specialistName && specialistName !== 'none') {
    specialist = loadSpecialist(specialistName);
    if (!specialist) die(EXIT.UNSUPPORTED, `unknown specialist profile "${specialistName}"`);
  }

  // Reading, deny-listing, secret-sweeping and size-capping all happen here,
  // before anything is handed to a provider.
  const scopeRoot = task.scope?.root ? path.resolve(task.scope.root) : process.cwd();

  // In the repository-visible modes the provider is handed scope.root itself,
  // so the deny list has to hold at the directory boundary as well as on the
  // declared file list — otherwise an unlisted .env in that tree is readable
  // while `context_sent` names only the files that were pushed.
  const repositoryVisible = REPOSITORY_VISIBLE_MODES.includes(mode) && entry.type === 'cli-agent';
  if (repositoryVisible) {
    const exposureGate = gateRepositoryExposure(scopeRoot);
    if (exposureGate) die(exposureGate.code, `${name}: ${exposureGate.message}`);
  }

  let context;
  try {
    context = gateContext(task, registry.defaults ?? {}, scopeRoot);
  } catch (e) {
    if (e instanceof GateError) die(e.code, `${name}: ${e.message}`);
    die(EXIT.FAILURE, e.message);
  }

  const prompt = buildPrompt({ task, specialist, files: context.files, mode });
  const timeoutMs = timeoutSeconds * 1000;

  const started = Date.now();
  let result;
  let commandLine;
  const secrets = [];

  if (entry.type === 'cli-agent') {
    let built;
    try {
      built = buildArgv(entry, mode, { model: entry.default_model, prompt, dir: scopeRoot });
    } catch (e) {
      die(EXIT.UNSUPPORTED, `${name}: ${e.message}`);
    }
    commandLine = commandLineFor(entry.bin, built.argv, prompt);

    // `advisory` means no repository context is *sent*, and the dispatcher
    // makes the repository hard to stumble into: the child is spawned in a
    // throwaway empty directory rather than inheriting this process's cwd, and
    // buildChildEnv strips every variable that is not on its allowlist, so the
    // repository path does not travel in PWD, INIT_CWD, CLAUDE_PROJECT_DIR or
    // any of the other breadcrumbs a Claude Code session exports.
    //
    // It is NOT a read confinement. A CLI provider that accepts an absolute
    // path can still open one — codex's `--sandbox read-only` restricts writes,
    // not reads — so advisory bounds what this dispatcher hands over, not what
    // a determined provider could reach. Enforcing the latter needs an OS-level
    // sandbox this script does not build. Stated in the same terms in
    // docs/external-delegation.md; do not upgrade the claim here.
    //
    // `repository-read` and `patch-proposal` are the modes actually meant to
    // see the repo, so they get scopeRoot, same as the `{dir}` placeholder.
    let providerCwd = scopeRoot;
    let advisoryCwd = null;
    if (mode === 'advisory') {
      advisoryCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'gd-ext-advisory-'));
      providerCwd = advisoryCwd;
    }
    try {
      result = await runCli(entry, name, built, timeoutMs, { cwd: providerCwd });
    } finally {
      if (advisoryCwd) fs.rmSync(advisoryCwd, { recursive: true, force: true });
    }
  } else if (entry.type === 'openai-compatible') {
    result = await runHttp(entry, prompt, timeoutMs);
    if (result.apiKey) secrets.push(result.apiKey);
    commandLine = `POST ${process.env[entry.env.base_url] || entry.endpoint_defaults?.base_url}/chat/completions`;
  } else {
    die(EXIT.FAILURE, `${name}: unknown provider type "${entry.type}"`);
  }

  // buildEnvelope redacts command/stdout/stderr internally from `secrets` —
  // raw values are passed here, not pre-redacted.
  const envelope = buildEnvelope({
    provider: name,
    specialist: specialist?.name ?? null,
    mode,
    exitCode: result.exitCode,
    durationMs: Date.now() - started,
    command: commandLine,
    files: context.files,
    totalBytes: context.totalBytes,
    stdout: result.stdout,
    stderr: result.stderr,
    timedOut: result.timedOut,
    secrets,
    repositoryRoot: repositoryVisible ? scopeRoot : null,
  });

  const serialised = `${JSON.stringify(envelope, null, 2)}\n`;
  let outputRefused = false;
  if (outputFile) {
    // The provider has already been spawned and has already returned by this
    // point — its cost and any side effects are sunk. An unwritable path
    // (missing directory, permissions) must not discard the envelope that was
    // just computed: report the write failure and fall back to stdout so the
    // result of an already-paid-for run is never lost.
    //
    // The pre-flight existsSync check above is advisory, not a guarantee:
    // fs.existsSync follows symlinks and reports false for a *dangling* one
    // (its target doesn't exist), so a dangling symlink at --output's path
    // sails through that check and, with a plain 'w' write, the write follows
    // the link — an unscoped write to wherever the symlink points, which
    // is exactly the primitive finding 4 set out to remove. It also cannot
    // close a race where something is created at this path during the run.
    // `wx` (O_CREAT | O_EXCL) closes both: POSIX specifies O_EXCL fails with
    // EEXIST when the final path component is a symlink, dangling or not,
    // regardless of where it points, and the create-and-check become one
    // atomic syscall so nothing can be created in between.
    try {
      fs.writeFileSync(resolvedOutputFile, serialised, { flag: 'wx' });
    } catch (e) {
      if (e.code === 'EEXIST') {
        outputRefused = true;
        process.stderr.write(`external-ai: --output ${outputFile} already exists; refusing to overwrite it\n`);
      } else {
        process.stderr.write(`external-ai: cannot write --output ${outputFile}: ${e.message}\n`);
      }
      process.stdout.write(serialised);
    }
  } else {
    process.stdout.write(serialised);
  }

  // The envelope is emitted either way, so the agent always sees what happened.
  if (outputRefused) return EXIT.UNSUPPORTED;
  // A provider's own nonzero exit code lives in an arbitrary namespace it
  // does not coordinate with this contract's reserved values (10/11/12/13/
  // 14/20) — a provider that happens to exit 13 must not be reported as
  // EXIT.PRIVACY, which the caller reads as "refused, nothing was sent" when
  // in fact the run completed. `result.raw` is true only when `exitCode` is
  // that raw, unmapped provider status (set by runCli's final fallback, not
  // by any of its explicit TIMEOUT/AUTH/UNAVAILABLE/FAILURE branches).
  // envelope.exit_code above already preserved the true value, so collapsing
  // it here to a single non-reserved code (1) loses nothing.
  if (result.exitCode === 0) return EXIT.OK;
  return result.raw ? 1 : result.exitCode;
}

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));

  if (!command || command === 'help' || command === '--help' || command === '-h' || flags.help) {
    process.stdout.write(`${USAGE}\n`);
    process.exit(EXIT.OK);
  }

  let registry;
  try {
    registry = loadRegistry();
  } catch (e) {
    die(EXIT.FAILURE, e.message);
  }

  switch (command) {
    case 'list':
      process.exit(cmdList(registry, flags));
      break;
    case 'check':
      process.exit(cmdCheck(registry, flags));
      break;
    case 'run':
      process.exit(await cmdRun(registry, flags));
      break;
    default:
      process.stderr.write(`${USAGE}\n`);
      die(EXIT.FAILURE, `unknown command "${command}"`);
  }
}

main().catch((e) => die(EXIT.FAILURE, e.stack || e.message));
