
import { logger } from './logger.js';

interface BackendMetrics {
    totalRequests: number;
    totalErrors: number;
    totalLatencyMs: number;
    pendingRequests: number;
    lastRequestTime: number;
}

const metrics: Record<string, BackendMetrics> = {};

export class LoadBalancer {
    /**
     * Initialize metrics for a backend if not present
     */
    private static ensureBackend(backend: string) {
        if (!metrics[backend]) {
            metrics[backend] = {
                totalRequests: 0,
                totalErrors: 0,
                totalLatencyMs: 0,
                pendingRequests: 0,
                lastRequestTime: 0,
            };
        }
    }

    /**
     * Record when a request starts
     */
    public static startRequest(backend: string): number {
        this.ensureBackend(backend);
        metrics[backend].pendingRequests++;
        metrics[backend].lastRequestTime = Date.now();
        return Date.now();
    }

    /**
     * Record when a request ends (success or failure)
     */
    public static endRequest(backend: string, startTime: number, isError: boolean) {
        this.ensureBackend(backend);
        const duration = Date.now() - startTime;

        metrics[backend].pendingRequests = Math.max(0, metrics[backend].pendingRequests - 1);
        metrics[backend].totalRequests++;
        metrics[backend].totalLatencyMs += duration;

        if (isError) {
            metrics[backend].totalErrors++;
        }

        // Log high latency warning (threshold: 8000ms)
        if (duration > 8000) {
            logger.warn({ backend, duration }, 'High latency detected');
        }
    }

    /**
     * Get current metrics snapshot for a backend
     */
    public static getMetrics(backend: string) {
        this.ensureBackend(backend);
        const m = metrics[backend];
        const avgLatency = m.totalRequests > 0 ? Math.round(m.totalLatencyMs / m.totalRequests) : 0;
        const errorRate = m.totalRequests > 0 ? (m.totalErrors / m.totalRequests).toFixed(2) : '0.00';

        return {
            ...m,
            avgLatency,
            errorRate: parseFloat(errorRate),
        };
    }

    /**
     * Select best backend from a list of candidates based on Load & Availability.
     * Logic:
     * 1. Filter out circuit-broken backends (handled by caller ideally)
     * 2. Sort by: pendingRequests (asc) -> failureRate (asc) -> avgLatency (asc)
     */
    public static selectBestBackend(candidates: string[]): string {
        const scored = candidates.map(b => {
            const m = this.getMetrics(b);
            // Score: lower is better
            // Weight: Pending Requests (1000) + Error Rate * 100 + Latency / 100
            const score = (m.pendingRequests * 1000) + (m.errorRate * 100) + (m.avgLatency / 100);
            return { backend: b, score };
        });

        scored.sort((a, b) => a.score - b.score);

        if (scored.length > 0) {
            logger.debug({ candidates: scored }, 'LoadBalancer selected backend');
            return scored[0].backend;
        }
        return candidates[0]; // Default fallback
    }
}
