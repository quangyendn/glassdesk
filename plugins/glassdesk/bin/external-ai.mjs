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

import { loadRegistry } from './lib/load-config.mjs';
import { EXIT } from './lib/exit-codes.mjs';
import { probeProvider, probeAll } from './lib/provider-availability.mjs';
import { gateMode, gateCapability } from './lib/policy-gates.mjs';

const USAGE = `usage:
  external-ai.mjs list [--json]
  external-ai.mjs check --provider <name> [--mode <mode>] [--task-type <type>]
  external-ai.mjs run --provider <name|auto> [--specialist <name>] [--mode <mode>]
                      --task-file <path> [--timeout <seconds>] [--output <path>]

exit codes: 0 ok · 10 unavailable · 11 auth · 12 unsupported · 13 privacy · 14 timeout · 20 failure`;

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

  process.stdout.write(`${name}: ready for mode "${mode}"\n`);
  return EXIT.OK;
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
      // Wired in phase 03.
      die(EXIT.FAILURE, 'run is not implemented yet');
      break;
    default:
      process.stderr.write(`${USAGE}\n`);
      die(EXIT.FAILURE, `unknown command "${command}"`);
  }
}

main().catch((e) => die(EXIT.FAILURE, e.stack || e.message));
