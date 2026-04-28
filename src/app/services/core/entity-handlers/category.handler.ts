import { WritableSignal } from "@angular/core";
import { EntityHandler } from "./entity-handler.base";
import { Category } from "@models/category.model";
import {
  addIfNotExists,
  updateEntityInSignal,
  removeEntityFromArray,
} from "@stores/utils/store-helpers";

export class CategoryHandler extends EntityHandler<Category> {
  constructor(private signal: WritableSignal<Category[]>) {
    super();
  }

  add(data: Category): void {
    this.signal.update((items) => addIfNotExists(items, data));
  }

  update(id: string, updates: Partial<Category>, _resolvers?: Record<string, any>): void {
    updateEntityInSignal(this.signal, id, updates);
  }

  remove(id: string): void {
    this.signal.update((items) => removeEntityFromArray(items, id));
  }

  getById(id: string): Category | undefined {
    return this.signal().find((item) => item.id === id);
  }
}
