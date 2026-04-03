import { WritableSignal } from "@angular/core";
import { EntityHandler } from "./entity-handler.base";
import { Category } from "@models/category.model";

export class CategoryHandler extends EntityHandler<Category> {
  constructor(private signal: WritableSignal<Category[]>) {
    super();
  }

  add(data: Category): void {
    this.signal.update((items) => {
      if (items.some((i) => i.id === data.id)) return items;
      return [data, ...items];
    });
  }

  update(id: string, updates: Partial<Category>, _resolvers?: Record<string, any>): void {
    this.signal.update((items) =>
      items.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );
  }

  remove(id: string): void {
    this.signal.update((items) => items.filter((item) => item.id !== id));
  }

  getById(id: string): Category | undefined {
    return this.signal().find((item) => item.id === id);
  }
}
