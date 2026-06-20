export function filterBySearch<T>(items: T[], query: string, fields: (keyof T)[]): T[] {
  if (!query) return items;
  const lowerQuery = query.toLowerCase();
  return items.filter((item) =>
    fields.some((field) => {
      const value = item[field];
      return typeof value === "string" && value.toLowerCase().includes(lowerQuery);
    })
  );
}
export function countByStatus<T extends { status: string }>(items: T[], status: string): number {
  return items.filter((item) => item.status === status).length;
}
export function compareByTimestamp(a: { created_at?: string }, b: { created_at?: string }): number {
  return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
}
export function getLatestTimestamp(entity: { created_at?: string; updated_at?: string }): number {
  return Math.max(
    new Date(entity.created_at || 0).getTime(),
    new Date(entity.updated_at || 0).getTime()
  );
}
export function groupByField<T, K extends keyof T>(items: T[], field: K): Map<T[K], T[]> {
  const map = new Map<T[K], T[]>();
  for (const item of items) {
    const key = item[field];
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key)!.push(item);
  }
  return map;
}
