// Tiny timing util for V1 timing budgets. No imports from app code.

export const SCHEDULE: Record<string, number> = {
  search: 10000,
  issue: 30000,
  return: 30000,
};

const marks = new Map<string, number>();

function now(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

/** Record a start stamp for label. */
export function mark(label: string): void {
  marks.set(label, now());
}

/** Ms since mark(label). Returns -1 when no mark exists. */
export function measure(label: string): number {
  const start = marks.get(label);
  if (start === undefined) return -1;
  return now() - start;
}

/** Wrap fn and return its result plus elapsed ms. */
export async function timeOp<T>(label: string, fn: () => T | Promise<T>): Promise<{ result: T; ms: number }> {
  mark(label);
  const result = await fn();
  return { result, ms: measure(label) };
}
