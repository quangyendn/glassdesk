// Regex library for guardrails scanners.
// Each pattern carries: id, description, regex (global, multiline), remediation.

export const PERSONAL_PATH_PATTERNS = [
  {
    id: 'personal-macos-home',
    description: 'macOS personal home path (/Users/<name>/)',
    regex: /\/Users\/[A-Za-z0-9._-]+\//g,
    remediation: 'Replace with /Users/<name>/ or $HOME placeholder.',
  },
  {
    id: 'personal-linux-home',
    description: 'Linux personal home path (/home/<name>/)',
    regex: /\/home\/[A-Za-z0-9._-]+\//g,
    remediation: 'Replace with /home/<user>/ or $HOME placeholder.',
  },
  {
    id: 'personal-windows-home',
    description: 'Windows personal user path (C:\\Users\\<name>\\)',
    regex: /C:\\Users\\[A-Za-z0-9._-]+\\/g,
    remediation: 'Replace with C:\\Users\\<user>\\ or %USERPROFILE%.',
  },
];

export const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

// Standalone IPv4 (excluding obvious version strings & ranges starting with 0).
export const IPV4_REGEX = /\b(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\b/g;

export const PHONE_REGEX = /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;

// Vietnamese-specific diacritics (Latin Extended-Additional + combining marks).
export const VIETNAMESE_DIACRITIC_REGEX =
  /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ]/;

// Conventional Commits subject regex.
export const CONVENTIONAL_COMMIT_REGEX =
  /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([^)]+\))?!?:\s.+/;

// Private key markers.
export const PRIVATE_KEY_REGEX =
  /-----BEGIN (?:RSA |DSA |EC |OPENSSH |PGP )?PRIVATE KEY( BLOCK)?-----/;

// Common cloud credential patterns (lightweight; gitleaks handles the full set).
export const CLOUD_TOKEN_PATTERNS = [
  {
    id: 'aws-access-key',
    description: 'AWS access key ID',
    regex: /\bAKIA[0-9A-Z]{16}\b/g,
    remediation: 'Move to environment variable, rotate the exposed key.',
  },
  {
    id: 'github-token',
    description: 'GitHub fine-grained or classic token',
    regex: /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b/g,
    remediation: 'Revoke immediately at https://github.com/settings/tokens.',
  },
  {
    id: 'generic-api-key-assignment',
    description: 'Generic API key assignment with high entropy literal',
    regex: /(?:api[_-]?key|secret|token|password|passwd)\s*[:=]\s*['"][A-Za-z0-9+/=_-]{20,}['"]/gi,
    remediation: 'Move credential to environment variable or secrets manager.',
  },
];
