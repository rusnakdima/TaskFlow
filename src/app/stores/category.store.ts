/**
 * Category Store - Manages category state using Angular signals
 */

import { Injectable, signal, computed, Signal, WritableSignal } from "@angular/core";
import { Category } from "@models/category.model";
import {
  deduplicateAndFilterDeleted,
  addEntityToArray,
  removeEntityFromArray,
  updateEntityInArray,
  findById,
} from "./utils/store-helpers";

interface CategoryState {
  categories: Category[];
  loading: boolean;
  loaded: boolean;
  lastLoaded: Date | null;
}

const initialState: CategoryState = {
  categories: [],
  loading: false,
  loaded: false,
  lastLoaded: null,
};

@Injectable({
  providedIn: "root",
})
export class CategoryStore {
  private readonly state: WritableSignal<CategoryState> = signal(initialState);

  readonly categories: Signal<Category[]> = computed(() => {
    return deduplicateAndFilterDeleted(this.state().categories);
  });

  readonly loading: Signal<boolean> = computed(() => this.state().loading);
  readonly loaded: Signal<boolean> = computed(() => this.state().loaded);
  readonly lastLoaded: Signal<Date | null> = computed(() => this.state().lastLoaded);

  categoryById(id: string): Category | undefined {
    return findById(this.state().categories, id);
  }

  categoryExists(id: string): boolean {
    return this.categoryById(id) !== undefined;
  }

  categoriesByUserId(userId: string): Signal<Category[]> {
    return computed(() => this.categories().filter((category) => category.user?.id === userId));
  }

  setLoading(loading: boolean): void {
    this.state.update((state) => ({ ...state, loading }));
  }

  setLoaded(loaded: boolean): void {
    this.state.update((state) => ({
      ...state,
      loaded,
      lastLoaded: loaded ? new Date() : state.lastLoaded,
    }));
  }

  setCategories(categories: Category[]): void {
    this.state.update((state) => ({ ...state, categories }));
  }

  addCategory(category: Category): void {
    this.state.update((state) => ({
      ...state,
      categories: addEntityToArray(state.categories, category),
    }));
  }

  updateCategory(id: string, updates: Partial<Category>): void {
    this.state.update((state) => ({
      ...state,
      categories: updateEntityInArray(state.categories, id, updates),
    }));
  }

  removeCategory(id: string): void {
    this.state.update((state) => ({
      ...state,
      categories: removeEntityFromArray(state.categories, id),
    }));
  }

  restoreCategory(id: string): void {
    this.updateCategory(id, { isDeleted: false });
  }

  clear(): void {
    this.state.set(initialState);
  }

  bulkUpsertCategories(categories: Category[]): void {
    this.state.update((state) => {
      const categoryMap = new Map(state.categories.map((c) => [c.id, c]));
      for (const category of categories) {
        categoryMap.set(category.id, { ...categoryMap.get(category.id), ...category });
      }
      return { ...state, categories: Array.from(categoryMap.values()) };
    });
  }
}
