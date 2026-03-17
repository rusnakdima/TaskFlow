/**
 * Base store utilities for signal-based state management
 *
 * Provides common helper functions used across all entity stores
 */

import { computed, Signal } from "@angular/core";

/**
 * Deduplicate entities by ID, keeping the most recently updated version
 */
export function deduplicateById<T extends { id: string; updatedAt?: string }>(entities: T[]): T[] {
  const entityMap = new Map<string, T>();

  for (const entity of entities) {
    if (!entityMap.has(entity.id)) {
      entityMap.set(entity.id, entity);
    } else {
      const existing = entityMap.get(entity.id)!;
      // Keep the one with the latest updatedAt timestamp
      if (entity.updatedAt && existing.updatedAt) {
        if (new Date(entity.updatedAt).getTime() > new Date(existing.updatedAt).getTime()) {
          entityMap.set(entity.id, entity);
        }
      }
    }
  }

  return Array.from(entityMap.values());
}

/**
 * Filter out deleted entities
 */
export function filterDeleted<T extends { isDeleted?: boolean }>(entities: T[]): T[] {
  return entities.filter((entity) => !entity.isDeleted);
}

/**
 * Deduplicate and filter deleted entities (common combination)
 */
export function deduplicateAndFilterDeleted<
  T extends {
    id: string;
    isDeleted?: boolean;
    updatedAt?: string;
  },
>(entities: T[]): T[] {
  return filterDeleted(deduplicateById(entities));
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
export function findByParentId<T extends { parentId: string }>(
  entities: T[],
  parentId: string
): T[] {
  return entities.filter((entity) => entity.parentId === parentId);
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

/**
 * Sort entities by creation date (newest first)
 */
export function sortByNewest<T extends { createdAt?: string }>(entities: T[]): T[] {
  return [...entities].sort((a, b) => {
    const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bDate - aDate;
  });
}

/**
 * Sort entities by order field
 */
export function sortByOrder<T extends { order?: number }>(entities: T[]): T[] {
  return [...entities].sort((a, b) => (a.order || 0) - (b.order || 0));
}

/**
 * Group entities by a key
 */
export function groupByKey<T>(entities: T[], keySelector: (entity: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();

  for (const entity of entities) {
    const key = keySelector(entity);
    const existing = groups.get(key) || [];
    groups.set(key, [...existing, entity]);
  }

  return groups;
}

/**
 * Create a signal-based filtered view
 */
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
