/* sys lib */
import {
  Injectable,
  inject,
  signal,
  computed,
  Signal,
  WritableSignal,
  Injector,
} from "@angular/core";
import { Observable, of } from "rxjs";
import { tap, map, catchError } from "rxjs/operators";

/* models */
import { Todo } from "@models/todo.model";
import { Task, TaskStatus } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import { Category } from "@models/category.model";
import { Profile } from "@models/profile.model";
import { Comment } from "@models/comment.model";
import { Chat } from "@models/chat.model";
import { User } from "@models/user.model";

/* services */
import { AdminService } from "@services/data/admin.service";
import { AdminDataService, AdminDataWithRelations } from "@services/core/admin-data.service";
import { CascadeService } from "@services/core/cascade.service";
import { NotifyService } from "@services/notifications/notify.service";
import { StorageSignalMap } from "@models/storage-signal-map.model";

/* storage services */
import { StorageStateService } from "./storage/storage-state.service";
import { StorageCrudService } from "./storage/storage-crud.service";
import { StorageQueryService } from "./storage/storage-query.service";
import { StorageChatService } from "./storage/storage-chat.service";
import { StorageFacadeService } from "./storage/storage-facade.service";
import { StorageCascadeService } from "./storage/storage-cascade.service";
import { StorageAdminService } from "./storage/storage-admin.service";

/* utils */
import {
  updateEntityInSignal,
  removeEntityFromSignal,
  createGroupedMap,
  addEntityToSignal,
  groupByKey,
} from "@stores/utils/store-helpers";
import { TimestampHelper, VisibilityHelper, DEFAULT_CACHE_TTL_MS } from "@helpers/index";

export type StorageEntity = keyof EntityMap;
export type VisibilityFilter = "all" | "private" | "shared" | "public";

export interface ArchiveDataMap {
  [table: string]: any[];
}

interface EntityMap {
  todos: Todo;
  tasks: Task;
  subtasks: Subtask;
  categories: Category;
  profiles: Profile;
  chats: Chat;
  comments: Comment;
  users: User;
}

export type Operation = "getAll" | "get" | "create" | "update" | "updateAll" | "delete";

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_SIZE = 100;

@Injectable({ providedIn: "root" })
export class StorageService {
  private state = inject(StorageStateService);
  private crud = inject(StorageCrudService);
  private query = inject(StorageQueryService);
  private chat = inject(StorageChatService);
  private facade = inject(StorageFacadeService);
  private cascade = inject(StorageCascadeService);
  private admin = inject(StorageAdminService);

  private _notifyService: NotifyService | null = null;
  private _adminService: AdminService | null = null;
  private _adminDataService: AdminDataService | null = null;
  private _injector = inject(Injector);

  private get notifyService(): NotifyService {
    if (!this._notifyService) this._notifyService = this._injector.get(NotifyService);
    return this._notifyService;
  }
  private get adminService(): AdminService {
    if (!this._adminService) this._adminService = this._injector.get(AdminService);
    return this._adminService;
  }
  private get adminDataService(): AdminDataService {
    if (!this._adminDataService) this._adminDataService = this._injector.get(AdminDataService);
    return this._adminDataService;
  }

  constructor() {}

  // ==================== PUBLIC SIGNALS ====================
  get isLoading() {
    return this.admin.isLoading;
  }
  get loaded() {
    return this.admin.loaded;
  }
  get lastLoaded() {
    return this.admin.lastLoaded;
  }
  get cacheInvalidated() {
    return this.state.cacheInvalidated;
  }

  // ==================== O(1) LOOKUP MAPS ====================
  get todoMap() {
    return this.state.todoMap;
  }
  get taskMap() {
    return this.state.taskMap;
  }
  get subtaskMap() {
    return this.state.subtaskMap;
  }
  get commentMap() {
    return this.state.commentMap;
  }

  // ==================== GROUPED LOOKUP MAPS ====================
  get tasksByTodoId() {
    return this.state.tasksByTodoId;
  }
  get subtasksByTaskId() {
    return this.state.subtasksByTaskId;
  }
  get commentsByTaskId() {
    return this.state.commentsByTaskId;
  }
  get commentsBySubtaskId() {
    return this.state.commentsBySubtaskId;
  }
  get chatsByTodoId() {
    return this.state.chatsByTodoId;
  }

  // ==================== PAGINATION ====================
  get todosPagination() {
    return this.state.todosPagination;
  }
  get tasksPagination() {
    return this.state.tasksPagination;
  }
  get subtasksPagination() {
    return this.state.subtasksPagination;
  }
  get commentsPagination() {
    return this.state.commentsPagination;
  }
  get chatsPagination() {
    return this.state.chatsPagination;
  }

  // ==================== HAS MORE GETTERS ====================
  get hasMoreTodos(): boolean {
    return this.state.hasMoreTodos;
  }
  get hasMoreTasks(): boolean {
    return this.state.hasMoreTasks;
  }
  get hasMoreSubtasks(): boolean {
    return this.state.hasMoreSubtasks;
  }
  get hasMoreComments(): boolean {
    return this.state.hasMoreComments;
  }
  get hasMoreChats(): boolean {
    return this.state.hasMoreChats;
  }

  // ==================== PUBLIC DATA SIGNALS ====================
  get privateTodos() {
    return this.state.privateTodos;
  }
  get sharedTodos() {
    return this.state.sharedTodos;
  }
  get publicTodos() {
    return this.state.publicTodos;
  }
  get todos() {
    return this.state.todos;
  }
  get tasks() {
    return this.state.tasks;
  }
  get subtasks() {
    return this.state.subtasks;
  }
  get comments() {
    return this.state.comments;
  }
  get chats() {
    return this.state.chats;
  }
  get categories() {
    return this.state.categories;
  }
  get profile() {
    return this.state.profile;
  }
  get profiles() {
    return this.state.profiles;
  }
  get allProfiles() {
    return this.state.allProfiles;
  }
  get user() {
    return this.state.user;
  }
  get users() {
    return this.state.users;
  }
  get dailyActivities() {
    return this.state.dailyActivities;
  }
  get archivedTodos() {
    return this.state.archivedTodos;
  }
  get archivedTasks() {
    return this.state.archivedTasks;
  }
  get archivedSubtasks() {
    return this.state.archivedSubtasks;
  }

  // ==================== SIGNAL MAP ====================
  get signalMap(): StorageSignalMap {
    return this.state.signalMap;
  }

  // ==================== CACHE INVALIDATION ====================
  invalidateCache(): void {
    this.admin.setLoaded(false);
    this.admin.setLastLoaded(null);
    this.state._cacheInvalidated.set(true);
    this.state.chatsCache.clear();
    this.state.tasksByTodoCache.clear();
    this.state.cacheTimestamps.clear();
    setTimeout(() => this.state._cacheInvalidated.set(false), 0);
  }

  isCacheValid(cacheExpiryMs: number): boolean {
    return this.admin.isCacheValid(cacheExpiryMs);
  }

  // ==================== CRUD OPERATIONS ====================
  addItem(type: StorageEntity, data: any, options?: { isPrivate?: boolean }): void {
    this.crud.addItem(type, data, options);
  }

  updateItem(
    type: StorageEntity,
    id: string,
    updates: Partial<any>,
    options?: { isPrivate?: boolean }
  ): void {
    this.crud.updateItem(type, id, updates, options);
  }

  batchUpdate(
    type: StorageEntity,
    items: { id: string; updates: Partial<any> }[],
    options?: { isPrivate?: boolean }
  ): void {
    this.crud.batchUpdate(type, items, options);
  }

  removeItem(type: StorageEntity, id: string, parentId?: string, isShared: boolean = false): void {
    this.crud.removeItem(type, id, parentId, isShared);
  }

  getById<T extends keyof EntityMap>(type: T, id: string): EntityMap[T] | undefined {
    return this.crud.getById(type, id) as EntityMap[T] | undefined;
  }

  // ==================== O(1) LOOKUP METHODS ====================
  getTodoById(id: string): Todo | undefined {
    return this.query.getTodoById(id);
  }

  getTaskById(id: string): Task | undefined {
    return this.query.getTaskById(id);
  }

  getSubtaskById(id: string): Subtask | undefined {
    return this.query.getSubtaskById(id);
  }

  getCommentById(id: string): Comment | undefined {
    return this.query.getCommentById(id);
  }

  getTasksByTodoId(todo_id: string): Task[] {
    return this.query.getTasksByTodoId(todo_id);
  }

  getSubtasksByTaskId(task_id: string): Subtask[] {
    return this.query.getSubtasksByTaskId(task_id);
  }

  getCommentsByTaskId(task_id: string): Comment[] {
    return this.query.getCommentsByTaskId(task_id);
  }

  getCommentsBySubtaskId(subtask_id: string): Comment[] {
    return this.query.getCommentsBySubtaskId(subtask_id);
  }

  getChatsByTodoId(todo_id: string): Chat[] {
    return this.query.getChatsByTodoId(todo_id);
  }

  getChatsByTodo(todo_id?: string): Chat[] {
    return this.query.getChatsByTodo(todo_id);
  }

  // ==================== VISIBILITY-AWARE GETTERS ====================
  getTodos(visibility: VisibilityFilter = "all"): Todo[] {
    return this.query.getTodos(visibility);
  }

  getTasks(todoId?: string, visibility?: VisibilityFilter): Task[] {
    return this.query.getTasks(todoId, visibility);
  }

  getSubtasks(taskId?: string): Subtask[] {
    return this.query.getSubtasks(taskId);
  }

  getComments(taskId?: string, subtaskId?: string): Comment[] {
    return this.query.getComments(taskId, subtaskId);
  }

  getChats(todoId?: string): Chat[] {
    return this.query.getChats(todoId);
  }

  // ==================== OFFLINE CHECK HELPERS ====================
  isPrivateData(entity: any): boolean {
    return this.query.isPrivateData(entity);
  }

  canAccessOffline(visibility: VisibilityFilter): boolean {
    return this.query.canAccessOffline(visibility);
  }

  // ==================== CHAT OPERATIONS ====================
  getChatsByTodoReactive(todo_id?: string) {
    return this.chat.getChatsByTodoReactive(todo_id);
  }

  getTasksByTodoReactive(todo_id?: string) {
    return this.chat.getTasksByTodoReactive(todo_id);
  }

  setChatsByTodo(chats: Chat[], todo_id?: string): void {
    this.chat.setChatsByTodo(chats, todo_id);
  }

  addChatToTodo(chat: Chat, todo_id?: string): void {
    this.chat.addChatToTodo(chat, todo_id);
  }

  updateChatInTodo(chat: Chat, todo_id?: string): void {
    this.chat.updateChatInTodo(chat, todo_id);
  }

  deleteChatFromTodo(chatId: string, todo_id?: string): void {
    this.chat.deleteChatFromTodo(chatId, todo_id);
  }

  clearChatsByTodo(todo_id?: string): void {
    this.chat.clearChatsByTodo(todo_id);
  }

  // ==================== TODO OPERATIONS ====================
  moveTodoToShared(todo_id?: string): void {
    this.cascade.moveTodoToShared(todo_id);
  }

  moveTodoToPrivate(todo_id?: string): void {
    this.cascade.moveTodoToPrivate(todo_id);
  }

  // ==================== CASCADE OPERATIONS ====================
  removeTodoWithCascade(todo_id?: string): void {
    this.cascade.removeTodoWithCascade(todo_id);
  }

  removeRecordWithCascade(table: string, id: string, deletedAt?: string): void {
    this.cascade.removeRecordWithCascade(table, id, deletedAt);
  }

  restoreTodoWithCascade(data: {
    todo: Todo;
    tasks: Task[];
    subtasks: Subtask[];
    comments: Comment[];
    chats?: Chat[];
  }): void {
    this.cascade.restoreTodoWithCascade(data);
  }

  restoreRecordWithCascade(table: string, id: string): void {
    this.cascade.restoreRecordWithCascade(table, id);
  }

  updateRecordDeleteStatusWithCascade(table: string, id: string, deletedAt: boolean): void {
    this.cascade.updateRecordDeleteStatusWithCascade(table, id, deletedAt);
  }

  // ==================== ADMIN DATA LOADING ====================
  loadInitialData(type: string, limit: number): Observable<any> {
    return this.admin.loadInitialData(type, limit);
  }

  loadMoreData(type: string, skip: number): Observable<any> {
    return this.admin.loadMoreData(type, skip);
  }

  loadAdminData(force: boolean = false): Observable<AdminDataWithRelations> {
    return this.admin.loadAdminData(force);
  }

  // ==================== RECORD ADMIN OPERATIONS ====================
  updateRecord(table: string, id: string, updates: any): void {
    const sig = this.signalMap[table];
    if (!sig) return;
    sig.update((items: any[]) =>
      items.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );
  }

  updateRelatedRecords(parentTable: string, parentId: string, updates: any): void {
    if (parentTable === "todos") {
      this.state._tasks.update((tasks) =>
        tasks.map((task) => (task.todo_id === parentId ? { ...task, ...updates } : task))
      );
    } else if (parentTable === "tasks") {
      this.state._subtasks.update((subtasks) =>
        subtasks.map((subtask) =>
          subtask.task_id === parentId ? { ...subtask, ...updates } : subtask
        )
      );
    }
  }

  removeRecord(table: string, id: string): void {
    const sig = this.signalMap[table];
    if (!sig) return;
    sig.update((items: any[]) => items.filter((item: any) => item.id !== id));
    if (table === "todos") {
      this.state._tasks.update((tasks) => tasks.filter((task) => task.todo_id !== id));
    } else if (table === "tasks") {
      this.state._subtasks.update((subtasks) =>
        subtasks.filter((subtask) => subtask.task_id !== id)
      );
    }
  }

  updateRecordDeleteStatus(table: string, id: string, deletedAt: boolean): void {
    const timestamp = TimestampHelper.createTimestamp();
    this.updateRecord(table, id, {
      deleted_at: deletedAt ? timestamp : null,
      updated_at: timestamp,
    });
  }

  updateSignal(table: string, updater: (items: any[]) => any[]): void {
    const sig = this.signalMap[table];
    if (sig) sig.update(updater);
  }

  setSignal(table: string, items: any[]): void {
    const sig = this.signalMap[table];
    if (sig) sig.set(items);
  }

  // ==================== COMMENT OPERATIONS ====================
  addCommentToTask(comment: Comment, task_id?: string): void {
    if (!task_id) return;
    this.crud.addToSignal("comments", { ...comment, task_id: task_id });
  }

  addCommentToSubtask(comment: Comment, subtask_id?: string): void {
    if (!subtask_id) return;
    this.crud.addToSignal("comments", { ...comment, subtask_id: subtask_id });
  }

  removeCommentFromAll(commentId: string): void {
    this.crud.removeFromSignal("comments", commentId);
  }

  // ==================== NESTED STRUCTURE HELPERS ====================
  getTodosWithNestedTasks(): Todo[] {
    return this.query.getTodosWithNestedTasks();
  }

  getTasksWithNestedSubtasks(): Task[] {
    return this.query.getTasksWithNestedSubtasks();
  }

  getSubtasksWithNestedComments(): Subtask[] {
    return this.query.getSubtasksWithNestedComments();
  }

  // ==================== UTILITY METHODS ====================
  getAllByParentId<T extends "tasks" | "subtasks">(
    entityType: T,
    parentId: string
  ): T extends "tasks" ? Task[] : Subtask[] {
    return this.query.getAllByParentId(entityType, parentId) as any;
  }

  getUnreadChatCount(todoId: string, userId: string): number {
    return this.query.getUnreadChatCount(todoId, userId);
  }

  getUsername(userId: string): string {
    return this.query.getUsername(userId);
  }

  getTodoReactive(todo_id?: string) {
    return this.query.getTodoReactive(todo_id);
  }

  getTaskReactive(task_id?: string) {
    return this.query.getTaskReactive(task_id);
  }

  getTasksByTodoIdSignal(todo_id?: string): Task[] {
    return this.query.getTasksByTodoIdSignal(todo_id);
  }

  getSubtasksByTaskIdArray(task_id?: string): Subtask[] {
    return this.query.getSubtasksByTaskIdArray(task_id);
  }

  getSubtasksByTaskIdReactive(task_id?: string) {
    return this.query.getSubtasksByTaskIdReactive(task_id);
  }

  subtaskCountByTaskId(task_id?: string) {
    return this.query.subtaskCountByTaskId(task_id);
  }

  get subtasksGroupedByTask() {
    return this.state.subtasksGroupedByTask;
  }

  subtaskExists(id: string): boolean {
    return this.query.subtaskExists(id);
  }

  bulkUpsertSubtasks(subtasks: Subtask[]): void {
    this.chat.bulkUpsertSubtasks(subtasks);
  }

  get pendingTasksCount(): number {
    return this.query.pendingTasksCount;
  }

  // ==================== SET COLLECTION ====================
  setCollection<
    T extends
      | "categories"
      | "profiles"
      | "privateTodos"
      | "sharedTodos"
      | "publicTodos"
      | "allProfiles"
      | "user"
      | "tasks"
      | "subtasks"
      | "comments"
      | "chats"
      | "users"
      | "dailyActivities"
      | "todos",
  >(type: T, items: any, options?: { append?: boolean; resetPagination?: boolean }): void {
    this.facade.setCollection(type, items, options);
  }

  // ==================== PAGINATION HELPERS ====================
  updatePagination(
    type: "todos" | "tasks" | "subtasks" | "comments" | "chats",
    skip: number,
    limit: number,
    receivedCount: number
  ): void {
    this.facade.updatePagination(type, skip, limit, receivedCount);
  }

  resetPagination(type: "todos" | "tasks" | "subtasks" | "comments" | "chats"): void {
    this.facade.resetPagination(type);
  }

  setHasMoreTodos(hasMore: boolean): void {
    this.facade.setHasMoreTodos(hasMore);
  }

  // ==================== UPDATE AFTER OPERATION ====================
  updateAfterOperation(
    operation: Operation,
    table: string,
    result: any,
    id?: string,
    parentTodoId?: string
  ): void {
    this.facade.updateAfterOperation(
      operation,
      table,
      result,
      id,
      parentTodoId,
      this.notifyService
    );
  }

  // ==================== CLEAR ====================
  clear(): void {
    this.state._privateTodos.set([]);
    this.state._sharedTodos.set([]);
    this.state._publicTodos.set([]);
    this.state._tasks.set([]);
    this.state._subtasks.set([]);
    this.state._comments.set([]);
    this.state._chats.set([]);
    this.state._categories.set([]);
    this.state._profile.set(null);
    this.state._profiles.set([]);
    this.state._allProfiles.set([]);
    this.state._user.set(null);
    this.state._users.set([]);
    this.state._dailyActivities.set([]);
    this.admin.setLoaded(false);
    this.admin.setLastLoaded(null);
    this.state._cacheInvalidated.set(true);
    this.state.chatsCache.clear();
    this.state.tasksByTodoCache.clear();
    this.state.cacheTimestamps.clear();
    setTimeout(() => this.state._cacheInvalidated.set(false), 0);
  }

  // ==================== ARCHIVE HELPERS ====================
  private removeRecordWithCascadeFromArchive(
    data: ArchiveDataMap,
    table: string,
    recordId: string
  ): ArchiveDataMap {
    const updated = { ...data };
    const tableData = updated[table] || [];
    updated[table] = tableData.filter((r: any) => r.id !== recordId);

    if (table === "todos") {
      const todoTasks = tableData.filter((t: any) => t.todo_id === recordId);
      const todoTaskIds = todoTasks.map((t: any) => t.id);
      updated["tasks"] = (updated["tasks"] || []).filter((t: any) => t.todo_id !== recordId);
      updated["subtasks"] = (updated["subtasks"] || []).filter(
        (s: any) => !todoTaskIds.includes(s.task_id)
      );
      updated["comments"] = (updated["comments"] || []).filter(
        (c: any) => c.todo_id !== recordId && !todoTaskIds.includes(c.task_id)
      );
      updated["chats"] = (updated["chats"] || []).filter((c: any) => c.todo_id !== recordId);
    } else if (table === "tasks") {
      updated["subtasks"] = (updated["subtasks"] || []).filter((s: any) => s.task_id !== recordId);
      updated["comments"] = (updated["comments"] || []).filter((c: any) => c.task_id !== recordId);
    } else if (table === "subtasks") {
      updated["comments"] = (updated["comments"] || []).filter(
        (c: any) => c.subtask_id !== recordId
      );
    }

    return updated;
  }

  private getCascadeChildIds(restoredRecord: any): { taskIds: string[]; subtaskIds: string[] } {
    const taskIds = restoredRecord.tasks?.map((t: any) => t.id) || [];
    const subtaskIds =
      restoredRecord.tasks?.flatMap((t: any) => t.subtasks?.map((s: any) => s.id) || []) || [];
    return { taskIds, subtaskIds };
  }

  private applyArchiveRestore(
    data: ArchiveDataMap,
    table: string,
    restoredRecord: any,
    recordId: string
  ): ArchiveDataMap {
    const updated = { ...data };
    const tableData = updated[table] || [];
    updated[table] = tableData.map((r: any) => (r.id === recordId ? restoredRecord : r));

    if (table === "todos") {
      const { taskIds, subtaskIds } = this.getCascadeChildIds(restoredRecord);
      const existingTasks = data["tasks"] || [];
      const existingSubtasks = data["subtasks"] || [];
      const existingComments = data["comments"] || [];
      const existingChats = data["chats"] || [];

      const newTasks = restoredRecord.tasks || [];
      const newSubtasks = newTasks.flatMap((t: any) => t.subtasks || []);
      const newComments = newSubtasks.flatMap((s: any) => s.comments || []);

      updated["tasks"] = [
        ...existingTasks.filter((t: any) => !taskIds.includes(t.id)),
        ...newTasks,
      ];
      updated["subtasks"] = [
        ...existingSubtasks.filter((s: any) => !subtaskIds.includes(s.id)),
        ...newSubtasks,
      ];
      updated["comments"] = [
        ...existingComments.filter(
          (c: any) => c.todo_id !== recordId && !taskIds.includes(c.task_id)
        ),
        ...newComments,
      ];
      updated["chats"] = [...existingChats.filter((c: any) => c.todo_id !== recordId)];
    }

    return updated;
  }

  // ==================== FACADE METHODS ====================
  getTodosByVisibility(visibility?: string): Todo[] {
    return this.facade.getTodosByVisibility(visibility);
  }

  setCollectionByTable(table: string, data: any[], options?: { append?: boolean }): void {
    this.facade.setCollectionByTable(table, data, options);
  }
}
