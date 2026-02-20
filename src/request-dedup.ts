
import { logger } from './logger.js';

interface CachedRequest<T> {
    result: T;
    timestamp: number;
}

const DEFAULT_TTL_MS = 10000; // 10 seconds cache

export class RequestDeduplicator {
    private cache = new Map<string, CachedRequest<any>>();
    private pending = new Map<string, Promise<any>>();
    private readonly ttlMs: number;

    constructor(ttlMs: number = DEFAULT_TTL_MS) {
        this.ttlMs = ttlMs;
    }

    /**
     * Normalize key for cache lookup.
     * - Lowercase
     * - Trim whitespace
     * - Remove common punctuation at ends
     */
    private normalizeKey(key: string): string {
        return key
            .toLowerCase()
            .trim()
            .replace(/^['"]+|['"]+$/g, '')
            .replace(/[.,!?]+$/, '');
    }

    /**
     * Execute a request with deduplication and caching.
     * If a request with the same key is already pending, return the pending promise.
     * If a valid cache entry exists, return it immediately.
     */
    async execute<T>(
        rawKey: string,
        operation: () => Promise<T>
    ): Promise<T> {
        const key = this.normalizeKey(rawKey);
        const now = Date.now();

        // 1. Check Cache
        const cached = this.cache.get(key);
        if (cached) {
            if (now - cached.timestamp < this.ttlMs) {
                logger.debug({ key }, 'RequestDeduplicator: Cache hit');
                return cached.result;
            } else {
                this.cache.delete(key); // Expired
            }
        }

        // 2. Check Pending Requests (In-flight deduplication)
        if (this.pending.has(key)) {
            logger.info({ key }, 'RequestDeduplicator: Joining pending request');
            return this.pending.get(key) as Promise<T>;
        }

        // 3. Execute New Request
        logger.info({ key }, 'RequestDeduplicator: Starting new request');
        const promise = operation()
            .then((result) => {
                // Cache success
                this.cache.set(key, { result, timestamp: Date.now() });
                this.pending.delete(key);
                return result;
            })
            .catch((err) => {
                // Do not cache errors, remove pending
                this.pending.delete(key);
                throw err;
            });

        this.pending.set(key, promise);
        return promise;
    }

    /**
     * Clear all cache entries.
     */
    clear(): void {
        this.cache.clear();
        this.pending.clear();
    }
}

// Global instance specifically for web searches
export const searchDeduplicator = new RequestDeduplicator(1000 * 60 * 5); // 5 minutes cache for search results
