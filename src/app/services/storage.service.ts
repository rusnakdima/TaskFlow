import { Injector } from '@angular/core';
import { BaseStorageService } from '@core/services/storage-entity.service';
import { StorageCacheService } from '@core/services/storage-cache.service';
import { StorageQueryService } from '@core/services/storage-query.service';
import { MongoConnectionService } from '@core/services/mongo-connection.service';
import { NotifyService } from '@services/notifications/notify.service';

export class StorageService {
  constructor(
    private injector: Injector,
    private entityService: BaseStorageService,
    private cacheService: StorageCacheService,
    private queryService: StorageQueryService,
    private mongo: MongoConnectionService
  ) {}

  tasks() {
    return (this.entityService.tasks as any)().filter((t: any) => !t.deleted_at);
  }

  getTaskById(id: string) {
    return this.tasks().find((t: any) => t.id === id);
  }

  getTasksByTodoId(todoId: string) {
    return this.tasks().filter((t: any) => t.todo_id === todoId);
  }

  getSubtasksByTaskId(taskId: string) {
    return (this.entityService.subtasks as any)().filter((s: any) => s.task_id === taskId);
  }

  getCommentsByTaskId(taskId: string) {
    return (this.entityService.comments as any)().filter((c: any) => c.task_id === taskId);
  }

  taskMap() {
    const map = new Map();
    this.tasks().forEach((t: any) => map.set(t.id, t));
    return map;
  }

  tasksByTodoId() {
    const map = new Map();
    this.tasks().forEach((t: any) => {
      if (!map.has(t.todo_id)) map.set(t.todo_id, []);
      map.get(t.todo_id)!.push(t);
    });
    return map;
  }

  get pendingTasksCount() {
    return this.tasks().filter((t: any) => t.status === 'pending').length;
  }

  modify(entityName: string, operation: string, data: any) {
    if (operation === 'update') {
      this.entityService.updateEntity(entityName, data);
    } else if (operation === 'create') {
      this.entityService.addEntity(entityName, data);
    }
  }

  removeRecord(entityName: string, id: string) {
    this.entityService.removeEntity(entityName, id);
  }

  removeRecordWithCascade(entityName: string, id: string, deletedAt: string) {
    this.entityService.updateEntity(entityName, { id, deleted_at: deletedAt });
  }

  updateRecordDeleteStatusWithCascade(entityName: string, id: string, deleted: boolean) {
    const data = deleted ? { id, deleted_at: new Date().toISOString() } : { id, deleted_at: undefined };
    this.entityService.updateEntity(entityName, data);
  }

  restoreRecordWithCascade(entityName: string, id: string) {
    this.entityService.updateEntity(entityName, { id, deleted_at: undefined });
  }

  archivedTasks() {
    return (this.entityService.tasks as any)().filter((t: any) => t.deleted_at);
  }

  clear() {
    this.entityService.clearEntitySignals();
  }

  getTasks(_visibility?: string) {
    return this.tasks();
  }
}
