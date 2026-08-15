// Sync tuning constants, pulled out of src/lib/sync/index.ts so they're
// visible/adjustable in one place alongside the other *.config.ts files.

export const SYNC_CONFIG = {
  baseIntervalMs: 30_000,
  maxBackoffMs: 5 * 60_000, // cap at 5 minutes between retries
  maxBatchSize: 50,
} as const;
