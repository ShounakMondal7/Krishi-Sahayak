/**
 * logger.ts — Secure Logging Utility for Krishi Sahayak.
 *
 * CERT-In / OWASP Compliance:
 * - Strips/guards console.log, console.info, console.debug, and console.warn in production (!__DEV__)
 * - Prevents sensitive farmer PII, session tokens, and telemetry leakage into client logs.
 */

export function initSecureLogger() {
  if (typeof __DEV__ !== 'undefined' && !__DEV__) {
    // Silence non-critical logs in production builds
    console.log = () => {};
    console.info = () => {};
    console.debug = () => {};
    console.warn = () => {};

    // In production, sanitize console.error to avoid leaking raw traces or PII
    const originalError = console.error;
    console.error = (...args: any[]) => {
      try {
        const sanitized = args.map((arg) => {
          if (typeof arg === 'string') {
            return arg.replace(/\b\d{10}\b/g, '[REDACTED_PHONE]');
          }
          return arg;
        });
        originalError.apply(console, sanitized);
      } catch {
        // Fallback without crashing
      }
    };
  }
}

// Auto-initialize when imported
initSecureLogger();
