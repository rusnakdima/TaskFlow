import { WritableSignal } from "@angular/core";
import { EntityData } from "./entity-handler.base";
import {
  addEntityToArray,
  updateEntityInSignal,
  removeEntityFromArray,
} from "@stores/utils/store-helpers";

export abstract class BaseHandler<T extends EntityData> {
  protected signal: WritableSignal<T[]>;

  constructor(signal: WritableSignal<T[]>) {
    this.signal = signal;
  }

  add(data: T): void {
    this.signal.update((items) => addEntityToArray(items, data));
  }

  update(id: string, updates: Partial<T>): void {
    updateEntityInSignal(this.signal, id, updates);
  }

  remove(id: string): void {
    this.signal.update((items) => removeEntityFromArray(items, id));
  }

  getById(id: string): T | undefined {
    return this.signal().find((item) => item.id === id);
  }
}
