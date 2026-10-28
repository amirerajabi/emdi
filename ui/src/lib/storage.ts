// localStorage that never throws (private windows, blocked storage).

// Updated from Emdi (Folio's first name): take over its settings, recents and session once. The desktop shell reads
// them from Emdi's storage (desktop/src/migrate.ts); keys there start with "emdi.".
try {
  const old = (window as { folio?: { importedStorage?(): Record<string, string> | null } }).folio?.importedStorage?.();
  for (const [k, v] of Object.entries(old ?? {})) {
    const key = k.startsWith('emdi.') ? `folio.${k.slice(5)}` : null;
    if (key && localStorage.getItem(key) === null) localStorage.setItem(key, v);
  }
} catch {
  /* nothing to take over */
}

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`folio.${key}`);
    return raw ? ({ ...fallback, ...JSON.parse(raw) } as T) : fallback;
  } catch {
    return fallback;
  }
}

export function loadRaw<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`folio.${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(`folio.${key}`, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}
