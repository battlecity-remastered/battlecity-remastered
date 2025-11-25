"use strict";

const toFiniteNumber = (value, fallback = 0) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return fallback;
};

class LoopMonitor {
    constructor(options = {}) {
        const {
            reportIntervalMs = 5000,
            maxSamples = 600,
            label = 'loop-profiler',
            logger = console.log
        } = options;
        this.samples = [];
        this.maxSamples = Math.max(1, maxSamples);
        this.reportIntervalMs = Math.max(500, reportIntervalMs);
        this.lastReportAt = 0;
        this.label = label;
        this.logger = typeof logger === 'function' ? logger : console.log;
    }

    record(sample = {}) {
        const deltaMs = toFiniteNumber(sample.deltaMs, null);
        const durationNs = toFiniteNumber(sample.durationNs, null);
        const processMs = durationNs !== null ? (durationNs / 1e6) : null;
        this.samples.push({
            deltaMs,
            processMs
        });
        if (this.samples.length > this.maxSamples) {
            this.samples.shift();
        }
        const now = Date.now();
        if (!this.lastReportAt) {
            this.lastReportAt = now;
        }
        if ((now - this.lastReportAt) >= this.reportIntervalMs) {
            this.logSummary();
            this.lastReportAt = now;
        }
    }

    logSummary() {
        if (!this.samples.length) {
            return;
        }
        const deltas = this.samples
            .map((sample) => sample.deltaMs)
            .filter((value) => value !== null);
        const proc = this.samples
            .map((sample) => sample.processMs)
            .filter((value) => value !== null);
        if (!deltas.length && !proc.length) {
            return;
        }
        const formatMetric = (values) => {
            if (!values.length) {
                return null;
            }
            const sum = values.reduce((acc, value) => acc + value, 0);
            const avg = sum / values.length;
            const min = Math.min(...values);
            const max = Math.max(...values);
            return { avg, min, max };
        };
        const deltaMetric = formatMetric(deltas);
        const procMetric = formatMetric(proc);
        const parts = [];
        if (deltaMetric) {
            parts.push(`Δ ${deltaMetric.avg.toFixed(2)}ms (min ${deltaMetric.min.toFixed(2)}, max ${deltaMetric.max.toFixed(2)})`);
        }
        if (procMetric) {
            parts.push(`proc ${procMetric.avg.toFixed(2)}ms (min ${procMetric.min.toFixed(2)}, max ${procMetric.max.toFixed(2)})`);
        }
        if (parts.length && this.logger) {
            this.logger(`[${this.label}] ${parts.join(' | ')}`, {
                delta: deltaMetric,
                proc: procMetric
            });
        }
    }
}

module.exports = {
    LoopMonitor
};
