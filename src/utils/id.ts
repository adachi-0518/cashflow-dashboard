export function createId(prefix: string): string {
  const fallback = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  if (typeof crypto === "undefined" || typeof crypto.randomUUID !== "function") {
    return fallback;
  }

  return `${prefix}-${crypto.randomUUID()}`;
}
