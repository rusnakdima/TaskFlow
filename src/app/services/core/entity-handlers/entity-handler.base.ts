export interface EntityData {
  id: string;
  [key: string]: any;
}

export abstract class EntityHandler<T extends EntityData> {
  abstract add(data: T): void;
  abstract update(id: string, updates: Partial<T>): void;
  abstract remove(id: string, parentId?: string): void;
  abstract getById(id: string): T | undefined;
}
