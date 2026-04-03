export interface EntityData {
  id: string;
  [key: string]: any;
}

export abstract class EntityHandler<T extends EntityData> {
  abstract add(data: T): void;
  abstract update(id: string, updates: Partial<T>, resolvers?: Record<string, any>): void;
  abstract remove(id: string, parentId?: string): void;
  abstract getById(id: string): T | undefined;
}
