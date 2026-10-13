/**
 * Small TTL cache for system_configs documents, shared by every enforcement
 * call within one function instance. Keeps Firestore reads to at most
 * 1 read / doc / TTL / instance regardless of order volume.
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export type ConfigData = Record<string, unknown> | null;

export interface ConfigReader {
  /** Resolves to the document data, or null when the document does not exist. */
  get(path: string): Promise<ConfigData>;
}

export const DEFAULT_TTL_MS = 10_000;
/** If Firestore is unreachable, last-known values may be served for this long. */
export const DEFAULT_MAX_STALE_MS = 5 * 60_000;

interface Entry {
  value: ConfigData;
  fetchedAt: number;
}

export class ConfigCache {
  private readonly entries = new Map<string, Entry>();
  private readonly inflight = new Map<string, Promise<ConfigData>>();

  constructor(
    private readonly reader: ConfigReader,
    private readonly ttlMs: number = DEFAULT_TTL_MS,
    private readonly maxStaleMs: number = DEFAULT_MAX_STALE_MS,
    private readonly now: () => number = Date.now,
  ) {}

  async getDoc(path: string): Promise<ConfigData> {
    const entry = this.entries.get(path);
    if (entry && this.now() - entry.fetchedAt < this.ttlMs) return entry.value;

    // Coalesce concurrent misses into one Firestore read.
    const pending = this.inflight.get(path);
    if (pending) return pending;

    const load = this.reader
      .get(path)
      .then((value) => {
        this.entries.set(path, { value, fetchedAt: this.now() });
        return value;
      })
      .catch((err: unknown) => {
        const stale = this.entries.get(path);
        if (stale && this.now() - stale.fetchedAt <= this.maxStaleMs) {
          console.warn(`[featureFlags] Firestore read failed for ${path}; serving stale config.`, err);
          return stale.value;
        }
        throw err;
      })
      .finally(() => {
        this.inflight.delete(path);
      });

    this.inflight.set(path, load);
    return load;
  }

  invalidate(path?: string): void {
    if (path === undefined) this.entries.clear();
    else this.entries.delete(path);
  }
}

class FirestoreReader implements ConfigReader {
  async get(path: string): Promise<ConfigData> {
    if (getApps().length === 0) initializeApp();
    const snap = await getFirestore().doc(path).get();
    return snap.exists ? (snap.data() as Record<string, unknown>) : null;
  }
}

let defaultCache: ConfigCache | undefined;

export function getDefaultCache(): ConfigCache {
  defaultCache ??= new ConfigCache(new FirestoreReader());
  return defaultCache;
}
