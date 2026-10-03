export const summarize = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const quantile = (p: number): number => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)] ?? 0;
    const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
    return { samples: values.length, mean, p50: quantile(.5), p95: quantile(.95), p99: quantile(.99), worst: sorted.at(-1) ?? 0 };
};
