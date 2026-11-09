const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Reuse a key for an identical retry in this tab, including after a page reload. */
export function getClientSubmissionKey(storageKey: string, fingerprint: string): string {
  try {
    const cached = window.sessionStorage.getItem(storageKey);
    if (cached) {
      const parsed: unknown = JSON.parse(cached);
      if (typeof parsed === 'object' && parsed !== null
        && 'fingerprint' in parsed && parsed.fingerprint === fingerprint
        && 'key' in parsed && typeof parsed.key === 'string' && uuidPattern.test(parsed.key)) {
        return parsed.key;
      }
    }

    const key = window.crypto.randomUUID();
    window.sessionStorage.setItem(storageKey, JSON.stringify({ fingerprint, key }));
    return key;
  } catch {
    // The in-memory click guard still prevents same-render double submission.
    return window.crypto.randomUUID();
  }
}

export function clearClientSubmissionKey(storageKey: string, key: string): void {
  try {
    const cached = window.sessionStorage.getItem(storageKey);
    if (!cached) return;
    const parsed: unknown = JSON.parse(cached);
    if (typeof parsed === 'object' && parsed !== null && 'key' in parsed && parsed.key === key) {
      window.sessionStorage.removeItem(storageKey);
    }
  } catch {
    // Storage is optional; the server-side transaction ID remains idempotent.
  }
}
