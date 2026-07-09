import { inject } from "@angular/core";

export interface EntityOperation<T extends { id: string }> {
  execute(entities: T[]): T[];
}
export class AddOperation<T extends { id: string }> implements EntityOperation<T> {
  private data = inject<T>();
  execute(entities: T[]): T[] {
    if (entities.some((e) => e.id === this.data.id)) {
      return entities;
    }
    return [this.data, ...entities];
  }
}
export class UpdateOperation<T extends { id: string }> implements EntityOperation<T> {
  private id = inject<string>();
  private updates = inject<Partial<T>>();
  execute(entities: T[]): T[] {
    return entities.map((entity) =>
      entity.id === this.id ? { ...entity, ...this.updates } : entity
    );
  }
}
export class RemoveOperation<T extends { id: string }> implements EntityOperation<T> {
  private id = inject<string>();
  execute(entities: T[]): T[] {
    return entities.filter((entity) => entity.id !== this.id);
  }
}
