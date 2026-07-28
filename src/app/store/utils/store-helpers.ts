export const deduplicateById = (arr: unknown[]) => arr;
export const createGroupedMap = (arr: unknown[], keyFn: (item: any) => string) => {
  const map = new Map<string, unknown[]>();
  arr.forEach((item: any) => {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  });
  return map;
};
export const upsertEntityBulk = (existing: unknown[], newOnes: unknown[]) => [...existing, ...newOnes];
