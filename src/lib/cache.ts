export default class CacheManager<K = string, V = any> {
  private cache: Map<K, { expires: Date | null; value: V }>;

  constructor(cache: Map<K, { expires: Date | null; value: V }> = new Map()) {
    this.cache = cache;
  }

  private isExpired(entry: { expires: Date | null }): boolean {
    return !!entry.expires && entry.expires.getTime() < Date.now();
  }

  private cleanupExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expires && entry.expires.getTime() < now) {
        this.cache.delete(key);
      }
    }
  }

  get(key: K): V | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }

  getExpiry(key: K): Date | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return null;
    }
    return entry.expires;
  }

  has(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  clear(): void {
    this.cache.clear();
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  entries(): IterableIterator<[K, V]> {
    this.cleanupExpired();
    const entries = Array.from(this.cache.entries()).map(([key, value]) => [key, value.value] as [K, V]);
    return entries[Symbol.iterator]();
  }

  values(): IterableIterator<V> {
    this.cleanupExpired();
    const values = Array.from(this.cache.values()).map((entry) => entry.value);
    return values[Symbol.iterator]();
  }

  forEach(callbackfn: (value: V, key: K) => void): void {
    this.cleanupExpired();
    for (const [key, entry] of this.cache.entries()) {
      callbackfn(entry.value, key);
    }
  }

  keys(): IterableIterator<K> {
    this.cleanupExpired();
    return this.cache.keys();
  }

  set(key: K, value: V, expires: number | Date | null): this {
    let expiresAt: Date | null = null;
    if (expires instanceof Date) {
      expiresAt = expires;
    } else if (typeof expires === 'number') {
      expiresAt = new Date(Date.now() + expires);
    }
    this.cache.set(key, { value, expires: expiresAt });
    return this;
  }

  public cacheize(): Map<K, { expires: Date | null; value: V }> {
    return this.cache;
  }
}