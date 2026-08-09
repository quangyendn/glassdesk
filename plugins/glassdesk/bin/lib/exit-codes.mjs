// The dispatcher's contract with its caller. Documented in
// docs/external-delegation.md; do not renumber.
export const EXIT = {
  OK: 0,
  UNAVAILABLE: 10,   // enabled:false, binary absent, or required non-secret env unset
  AUTH: 11,          // no signed-in session, or api_key env unset
  UNSUPPORTED: 12,   // mode or task type this provider does not support
  PRIVACY: 13,       // classification violation or secret detected
  TIMEOUT: 14,
  FAILURE: 20,       // dispatcher itself failed
};
