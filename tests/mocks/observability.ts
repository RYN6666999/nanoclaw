
import { logger } from './logger.js';
import { LoadBalancer } from './backend-metrics.js';
import { getBreaker } from './backend-status.js';

interface BackendReport {
    backend: string;
    status: '🟢' | '🟡' | '🔴' | '⚪';
    pending: number;
    total: number;
    errors: number;
    avgLatencyMs: number;
    errorRate: string;
}

export class Observability {
    private static backends = [
        'deepseek-direct',
        'openrouter',
        'gemini',
        'local',
        'claude',
    ];

    /**
     * Generate a comprehensive health report for all backends.
     */
    public static async getHealthReport(): Promise<string> {
        const report: BackendReport[] = this.backends.map((b) => {
            const breaker = getBreaker(b);
            const metrics = LoadBalancer.getMetrics(b);
            const isAvailable = breaker.isAvailable();
            const state = breaker.getState();

            let status: '🟢' | '🟡' | '🔴' | '⚪' = '🟢';

            if (state === 'OPEN') status = '🔴';
            else if (state === 'HALF_OPEN') status = '🟡';
            else if (metrics.errorRate > 0.1 || metrics.avgLatency > 5000) status = '🟡';

            if (metrics.totalRequests === 0) status = '⚪'; // Idle

            return {
                backend: b,
                status,
                pending: metrics.pendingRequests,
                total: metrics.totalRequests,
                errors: metrics.totalErrors,
                avgLatencyMs: metrics.avgLatency,
                errorRate: (metrics.errorRate * 100).toFixed(1) + '%',
            };
        });

        // Format as a simple text table
        const header = `📊 **System Health Report**\nTime: ${new Date().toLocaleString()}\n`;
        const rows = report.map(r =>
            `${r.status} **${r.backend}**\n` +
            `   Queue: ${r.pending} | Latency: ${r.avgLatencyMs}ms | Err: ${r.errorRate}`
        ).join('\n');

        const footer = `\nActive Requests: ${report.reduce((sum, r) => sum + r.pending, 0)}`;

        return `${header}\n${rows}\n${footer}`;
    }

    /**
     * Log periodic metrics to the system logger.
     */
    public static logPeriodicMetrics() {
        this.backends.forEach((b) => {
            const m = LoadBalancer.getMetrics(b);
            const state = getBreaker(b).getState();

            if (m.totalRequests > 0) {
                logger.info({
                    backend: b,
                    state,
                    ...m
                }, 'Backend Metrics Snapshot');
            }
        });
    }
}
