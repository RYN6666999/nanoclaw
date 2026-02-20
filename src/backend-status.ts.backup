
import { logger } from './logger.js';

type BreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface BreakerConfig {
    failureThreshold: number;
    cooldownMs: number;
}

const DEFAULT_CONFIG: BreakerConfig = {
    failureThreshold: 3,
    cooldownMs: 30000, // 30 seconds
};

export class CircuitBreaker {
    private state: BreakerState = 'CLOSED';
    private failureCount = 0;
    private lastFailureTime = 0;
    private readonly name: string;
    private readonly config: BreakerConfig;

    constructor(name: string, config: Partial<BreakerConfig> = {}) {
        this.name = name;
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    public isAvailable(): boolean {
        if (this.state === 'CLOSED') return true;

        if (this.state === 'OPEN') {
            const now = Date.now();
            if (now - this.lastFailureTime > this.config.cooldownMs) {
                this.state = 'HALF_OPEN';
                logger.info({ backend: this.name }, 'Circuit Breaker entering HALF_OPEN state');
                return true; // Allow one trial request
            }
            return false;
        }

        return true; // HALF_OPEN, assume we allow traffic until failure
    }

    public recordSuccess(): void {
        if (this.state !== 'CLOSED') {
            logger.info({ backend: this.name }, 'Circuit Breaker recovered (CLOSED)');
            this.state = 'CLOSED';
            this.failureCount = 0;
        }
        // Also reset failure count on success in CLOSED state to prevent old failures from accumulating?
        // Usually standard pattern keeps count until threshold, but maybe we should decay/reset.
        // For simplicity, we reset on success if we were recovering. 
        // If clearly closed, we can optionally reset or just leave it. Let's reset to be forgiving.
        this.failureCount = 0;
    }

    public recordFailure(): void {
        this.failureCount++;
        this.lastFailureTime = Date.now();

        if (this.state === 'CLOSED' && this.failureCount >= this.config.failureThreshold) {
            this.state = 'OPEN';
            logger.warn({ backend: this.name, failures: this.failureCount }, 'Circuit Breaker OPENED (backend paused)');
        } else if (this.state === 'HALF_OPEN') {
            this.state = 'OPEN'; // Failed the trial
            logger.warn({ backend: this.name }, 'Circuit Breaker re-OPENED after failed trial');
        }
    }

    public getState(): BreakerState {
        return this.state;
    }
}

// Global registry for backend breakers
const breakers: Record<string, CircuitBreaker> = {};

export function getBreaker(backend: string): CircuitBreaker {
    if (!breakers[backend]) {
        breakers[backend] = new CircuitBreaker(backend);
    }
    return breakers[backend];
}
