/**
 * Base store utilities for signal-based state management
 *
 * Provides common helper functions used across all entity stores
 */

import { WritableSignal } from "@angular/core";
import { computed, Signal } from "@angular/core";

/**
 * Deduplicate entities by ID, keeping the most recently updated version
 */
export function deduplicateById<T extends { id: string; updated_at?: string; deleted_at?: string }>(
  entities: T[],
  options?: { filterDeleted?: boolean }
): T[] {
  const map = new Map<string, T>();

  for (const entity of entities) {
    if (options?.filterDeleted && entity.deleted_at) continue;

    const existing = map.get(entity.id);
    if (!existing) {
      map.set(entity.id, entity);
    } else if (entity.updated_at && existing.updated_at) {
      if (new Date(entity.updated_at).getTime() > new Date(existing.updated_at).getTime()) {
        map.set(entity.id, entity);
      }
    }
  }

  return Array.from(map.values());
}

export function deduplicateAndFilterDeleted<
  T extends {
    id: string;
    deleted_at?: string | null;
    updated_at?: string;
  },
>(entities: T[]): T[] {
  return deduplicateById(entities, { filterDeleted: true });
}

/**
 * Find entity by ID from an array
 */
export function findById<T extends { id: string }>(entities: T[], id: string): T | undefined {
  return entities.find((entity) => entity.id === id);
}

/**
 * Find entities by parent ID
 */
export function findByParentId<T extends { parent_id: string }>(
  entities: T[],
  parentId: string
): T[] {
  return entities.filter((entity) => entity.parent_id === parentId);
}

/**
 * Update entity in array by ID
 */
export function updateEntityInArray<T extends { id: string }>(
  entities: T[],
  id: string,
  updates: Partial<T>
): T[] {
  return entities.map((entity) => (entity.id === id ? { ...entity, ...updates } : entity));
}

/**
 * Add entity to array (if not already exists)
 */
export function addEntityToArray<T extends { id: string }>(entities: T[], entity: T): T[] {
  if (entities.some((e) => e.id === entity.id)) {
    return entities;
  }
  return [entity, ...entities];
}

/**
 * Remove entity from array by ID
 */
export function removeEntityFromArray<T extends { id: string }>(entities: T[], id: string): T[] {
  return entities.filter((entity) => entity.id !== id);
}

export function createFilteredView<T>(
  sourceSignal: Signal<T[]>,
  filterFn: (entity: T) => boolean
): Signal<T[]> {
  return computed(() => sourceSignal().filter(filterFn));
}

/**
 * Create a signal-based sorted view
 */
export function createSortedView<T>(
  sourceSignal: Signal<T[]>,
  compareFn: (a: T, b: T) => number
): Signal<T[]> {
  return computed(() => [...sourceSignal()].sort(compareFn));
}

/**
 * Merge multiple entity arrays and deduplicate
 */
export function mergeAndDeduplicate<T extends { id: string }>(...arrays: T[][]): T[] {
  const all = arrays.flat();
  return deduplicateById(all);
}

/**
 * Check if entity exists in array by ID
 */
export function existsById<T extends { id: string }>(entities: T[], id: string): boolean {
  return entities.some((entity) => entity.id === id);
}

export function groupByKey<T, K>(entities: T[], keyFn: (entity: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const entity of entities) {
    const key = keyFn(entity);
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key)!.push(entity);
  }
  return map;
}

export function createGroupedMap<T, K>(
  entities: T[],
  keyFn: (entity: T) => K | undefined,
  filterFn?: (entity: T) => boolean
): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const entity of filterFn ? entities.filter(filterFn) : entities) {
    const key = keyFn(entity);
    if (key !== undefined) {
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(entity);
    }
  }
  return map;
}

export function createEntityLookupMap<T extends { id: string }>(entities: T[]): Map<string, T> {
  return new Map(entities.map((e) => [e.id, e]));
}

export function applyUpdate<T extends { id: string }>(entity: T, updates: Partial<T>): T {
  return { ...entity, ...updates };
}

export function upsertEntity<T extends { id: string }>(
  entities: T[],
  entity: T,
  updateExisting = true
): T[] {
  const index = entities.findIndex((e) => e.id === entity.id);
  if (index === -1) {
    return [entity, ...entities];
  }
  if (updateExisting) {
    return entities.map((e) => (e.id === entity.id ? { ...e, ...entity } : e));
  }
  return entities;
}

export function addEntityToSignal<T extends { id: string }>(
  signal: WritableSignal<T[]>,
  entity: T
): void {
  if (!signal().some((e) => e.id === entity.id)) {
    signal.update((items) => [entity, ...items]);
  }
}

export function removeEntityFromSignal<T extends { id: string }>(
  signal: WritableSignal<T[]>,
  id: string
): void {
  signal.update((items) => items.filter((item) => item.id !== id));
}

export function updateEntityInSignal<T extends { id: string }>(
  signal: WritableSignal<T[]>,
  id: string,
  updates: Partial<T>
): void {
  signal.update((items) => items.map((item) => (item.id === id ? { ...item, ...updates } : item)));
}

export function upsertEntityBulk<T extends { id: string }>(
  entities: T[],
  newEntities: T[],
  updateExisting = true
): T[] {
  const entityMap = new Map(entities.map((e) => [e.id, e]));
  for (const entity of newEntities) {
    entityMap.set(entity.id, updateExisting ? { ...entityMap.get(entity.id), ...entity } : entity);
  }
  return Array.from(entityMap.values());
}

export function addEntityBulkToSignal<T extends { id: string }>(
  signal: WritableSignal<T[]>,
  newEntities: T[],
  updateExisting = true
): void {
  signal.update((existing) => upsertEntityBulk(existing, newEntities, updateExisting));
}

/**
 * Get entity IDs from an array
 */
export function getEntityIds<T extends { id: string }>(entities: T[]): string[] {
  return entities.map((entity) => entity.id);
}

/**
 * Create a map of entities by ID for O(1) lookups
 */
export function createEntityMap<T extends { id: string }>(entities: T[]): Map<string, T> {
  return new Map(entities.map((entity) => [entity.id, entity]));
}

/**
 * Batch update entities
 */
export function batchUpdateEntities<T extends { id: string }>(
  entities: T[],
  updates: Map<string, Partial<T>>
): T[] {
  return entities.map((entity) => {
    const entityUpdates = updates.get(entity.id);
    return entityUpdates ? { ...entity, ...entityUpdates } : entity;
  });
}

/**
 * Deep clone an entity (for immutable updates)
 */
export function deepCloneEntity<T>(entity: T): T {
  return JSON.parse(JSON.stringify(entity));
}

/**
 * Compare two entities for equality
 */
export function entitiesEqual<T extends { id: string }>(a: T, b: T, fields?: (keyof T)[]): boolean {
  if (a.id !== b.id) return false;

  if (!fields) return true;

  for (const field of fields) {
    if (a[field] !== b[field]) return false;
  }

  return true;
}
