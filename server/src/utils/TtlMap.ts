/**
 * Map for in-memory job trackers and caches that must not grow for the life of
 * the process. Entries expire `ttlMs` after their last `set`, and the oldest
 * entries are dropped once `maxSize` is exceeded. Expired entries are skipped
 * by get/has and swept at most once per `ttlMs / 4` on writes, so no timer is
 * kept alive.
 */
export class TtlMap<K, V> extends Map<K, V> {
  private readonly expiresAt = new Map<K, number>();
  private nextSweep = 0;

  constructor(
    private readonly ttlMs: number,
    private readonly maxSize = 1000
  ) {
    super();
  }

  override set(key: K, value: V): this {
    // Re-insert so Map order stays oldest-first by last write.
    super.delete(key);
    super.set(key, value);
    this.expiresAt.set(key, Date.now() + this.ttlMs);
    this.prune();
    return this;
  }

  override get(key: K): V | undefined {
    return this.isExpired(key) ? undefined : super.get(key);
  }

  override has(key: K): boolean {
    return !this.isExpired(key) && super.has(key);
  }

  override delete(key: K): boolean {
    this.expiresAt.delete(key);
    return super.delete(key);
  }

  override clear(): void {
    this.expiresAt.clear();
    super.clear();
  }

  private isExpired(key: K): boolean {
    const at = this.expiresAt.get(key);
    if (at === undefined || at > Date.now()) return false;
    this.delete(key);
    return true;
  }

  private prune() {
    const now = Date.now();
    if (now >= this.nextSweep) {
      this.nextSweep = now + Math.max(1000, this.ttlMs / 4);
      for (const [key, at] of this.expiresAt) if (at <= now) this.delete(key);
    }
    while (super.size > this.maxSize) {
      const oldest = super.keys().next();
      if (oldest.done) break;
      this.delete(oldest.value);
    }
  }
}
