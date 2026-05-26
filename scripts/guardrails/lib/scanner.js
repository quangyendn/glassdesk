// Shared scanning logic: given a body of text + the active config, return findings.
import {
  PERSONAL_PATH_PATTERNS,
  EMAIL_REGEX,
  CLOUD_TOKEN_PATTERNS,
  PRIVATE_KEY_REGEX,
} from './patterns.js';

function isEmailAllowed(email, allowlist) {
  const lower = email.toLowerCase();
  return allowlist.some((entry) => {
    const e = entry.toLowerCase();
    return e.startsWith('@') ? lower.endsWith(e) : lower === e;
  });
}

export function scanText(text, config, { path = '<input>' } = {}) {
  const findings = [];
  const lines = text.split(/\r?\n/);

  const push = (lineIdx, rule, match) => {
    findings.push({
      path,
      line: lineIdx + 1,
      rule: rule.id,
      description: rule.description,
      match: redactMatch(match),
      remediation: rule.remediation,
    });
  };

  lines.forEach((line, idx) => {
    for (const rule of PERSONAL_PATH_PATTERNS) {
      const re = new RegExp(rule.regex.source, rule.regex.flags);
      let m;
      while ((m = re.exec(line)) !== null) push(idx, rule, m[0]);
    }
    for (const rule of CLOUD_TOKEN_PATTERNS) {
      const re = new RegExp(rule.regex.source, rule.regex.flags);
      let m;
      while ((m = re.exec(line)) !== null) push(idx, rule, m[0]);
    }
    if (PRIVATE_KEY_REGEX.test(line)) {
      push(idx, {
        id: 'private-key',
        description: 'Private key block detected',
        remediation: 'Remove the key, rotate the keypair, and store the secret out of band.',
      }, line.trim());
    }
    const emailRe = new RegExp(EMAIL_REGEX.source, EMAIL_REGEX.flags);
    let em;
    while ((em = emailRe.exec(line)) !== null) {
      if (!isEmailAllowed(em[0], config.emailAllowlist)) {
        push(idx, {
          id: 'unallowlisted-email',
          description: 'Email address not on the allowlist',
          remediation: 'Replace with example domain (e.g. user@example.com) or add to emailAllowlist.',
        }, em[0]);
      }
    }
    for (const ref of config.internalRefs) {
      if (!ref) continue;
      const re = new RegExp(`\\b${escapeRegex(ref)}\\b`, 'gi');
      let m;
      while ((m = re.exec(line)) !== null) {
        push(idx, {
          id: 'internal-ref',
          description: `Internal reference "${ref}"`,
          remediation: 'Remove the internal reference or replace with a generic placeholder.',
        }, m[0]);
      }
    }
  });

  return findings;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function redactMatch(s) {
  if (s.length <= 12) return s;
  return `${s.slice(0, 6)}…${s.slice(-3)}`;
}

export function isPathAllowed(filePath, allowlist) {
  return allowlist.some((entry) => filePath === entry || filePath.startsWith(entry));
}

export function formatFindings(findings) {
  if (findings.length === 0) return '';
  const lines = ['[guardrails] Findings:'];
  for (const f of findings) {
    lines.push(`  ✗ ${f.path}:${f.line}  ${f.rule}  ${f.description}`);
    lines.push(`      match: ${f.match}`);
    if (f.remediation) lines.push(`      fix:   ${f.remediation}`);
  }
  return lines.join('\n');
}
