// Secret detection for the external-provider preflight.
//
// Intentionally duplicated from scripts/guardrails/lib/patterns.js. The
// dispatcher must run from <project>/.claude/ after `npx glassdesk init`,
// where the repo-root guardrails tree does not exist, so importing it would
// break the portability contract. tests/external-delegate/secret-patterns-drift.test.js
// fails if the guardrails source grows a pattern this copy lacks.

export const DENY_PATH_GLOBS = [
  '.env*',
  '**/.env*',
  '**/secrets/**',
  '**/credentials*',
  'credentials*',
  '*.pem',
  '**/*.pem',
  'id_rsa*',
  '**/id_rsa*',
  '*.p12',
  '*.pfx',
  '*.key',
];

export const SECRET_CONTENT_PATTERNS = [
  {
    id: 'private-key-block',
    description: 'PEM private key header',
    regex: /-----BEGIN (?:RSA |DSA |EC |OPENSSH |PGP )?PRIVATE KEY( BLOCK)?-----/g,
  },
  {
    id: 'aws-access-key',
    description: 'AWS access key ID',
    regex: /\bAKIA[0-9A-Z]{16}\b/g,
  },
  {
    id: 'github-token',
    description: 'GitHub token',
    regex: /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b/g,
  },
  {
    id: 'generic-api-key-assignment',
    description: 'Credential assignment with a high-entropy literal',
    regex: /(?:api[_-]?key|secret|token|password|passwd)\s*[:=]\s*['"][A-Za-z0-9+/=_-]{20,}['"]/gi,
  },
  {
    id: 'openai-style-key',
    description: 'OpenAI-style secret key',
    regex: /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    id: 'slack-token',
    description: 'Slack bot or user token',
    regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  },
];

// Translate a glob to an anchored RegExp. `*` stops at a separator, `**`
// crosses them, `?` matches one non-separator character. Everything else is
// escaped literally.
export function globToRegExp(glob) {
  let out = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') {
          i++;
          out += '(?:.*/)?';
        } else {
          // Trailing `**` with nothing after it (e.g. the second `**` in
          // `**/secrets/**`) must match a bare filename too, not just
          // slash-terminated segments — otherwise `secrets/d.txt` never
          // matches. See tests/external-delegate/secret-patterns-drift.test.js
          // ("** crosses separators").
          out += '.*';
        }
      } else {
        out += '[^/]*';
      }
    } else if (c === '?') {
      out += '[^/]';
    } else {
      out += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${out}$`);
}

// Match a repo-relative path against the deny list. Both the full path and
// the basename are tested, so `.env*` catches `config/.env.local`.
export function matchesDenyGlob(relPath) {
  const normalised = String(relPath).replace(/\\/g, '/').replace(/^\.\//, '');
  const base = normalised.split('/').pop();
  for (const glob of DENY_PATH_GLOBS) {
    const re = globToRegExp(glob);
    if (re.test(normalised) || re.test(base)) return glob;
  }
  return null;
}

// Report which patterns matched. Deliberately returns ids and descriptions
// only — never the matched text, which would put the secret in the log.
export function scanForSecrets(text) {
  const hits = [];
  const seen = new Set();
  for (const p of SECRET_CONTENT_PATTERNS) {
    p.regex.lastIndex = 0;
    if (p.regex.test(String(text)) && !seen.has(p.id)) {
      seen.add(p.id);
      hits.push({ id: p.id, description: p.description });
    }
    p.regex.lastIndex = 0;
  }
  return hits;
}
