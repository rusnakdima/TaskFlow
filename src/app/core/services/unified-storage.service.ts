/* sys lib */
import { Injectable, inject } from "@angular/core";
import { Observable, of, from } from "rxjs";
import { tap, catchError, map } from "rxjs/operators";

/* models */
import {
  Todo,
  Task,
  Subtask,
  Comment,
  Chat,
  User,
  Category,
  Profile,
  Room,
} from "@models/generated/api.types";
import { EntityType, ChildType, VisibilityFilter } from "@models/storage.model";

/* services */
import { ApiService } from "@services/api.service";
import { LoggerService } from "@shared/services/logger.service";

/* child services */
import { BaseStorageService, DEFAULT_PAGINATION } from "./storage-entity.service";
import { StoragePaginationService } from "./storage-pagination.service";
import { StorageChatService } from "./storage-chat.service";

/* utils */
import { upsertEntityBulk } from "@stores/utils/store-helpers";

@Injectable({ providedIn: "root" })
export class UnifiedStorageService {
  private readonly _paginationService = inject(StoragePaginationService);
  private readonly _chatService = inject(StorageChatService);
  private readonly _baseService = inject(BaseStorageService);
  private readonly _apiService = inject(ApiService);
  private loggingService = inject(LoggerService);

  /* ════════════════════════════════════════════════════════════════════════
     PROXY ALL ENTITY SIGNALS FROM BASE
     ════════════════════════════════════════════════════════════════════════ */

  readonly todos = this._baseService.todos;
  readonly tasks = this._baseService.tasks;
  readonly subtasks = this._baseService.subtasks;
  readonly comments = this._baseService.comments;
  readonly chats = this._baseService.chats;
  readonly categories = this._baseService.categories;
  readonly profiles = this._baseService.profiles;
  readonly publicProfiles = this._baseService.publicProfiles;
  readonly users = this._baseService.users;
  readonly currentUser = this._baseService.currentUser;
  readonly rooms = this._baseService.rooms;

  readonly conversations = this._baseService.conversations;
  readonly messages = this._baseService.messages;
  readonly activeConversationId = this._baseService.activeConversationId;

  readonly privateTodos = this._baseService.privateTodos;
  readonly sharedTodos = this._baseService.sharedTodos;
  readonly publicTodos = this._baseService.publicTodos;
  readonly allTodos = this._baseService.allTodos;
  readonly archivedTodos = this._baseService.archivedTodos;
  readonly activeTasks = this._baseService.activeTasks;
  readonly archivedTasks = this._baseService.archivedTasks;
  readonly tasksByTodoId = this._baseService.tasksByTodoId;
  readonly activeSubtasks = this._baseService.activeSubtasks;
  readonly archivedSubtasks = this._baseService.archivedSubtasks;
  readonly subtasksByTaskId = this._baseService.subtasksByTaskId;
  readonly activeComments = this._baseService.activeComments;
  readonly commentsByTaskId = this._baseService.commentsByTaskId;
  readonly commentsBySubtaskId = this._baseService.commentsBySubtaskId;
  readonly activeChats = this._baseService.activeChats;
  readonly todoMap = this._baseService.todoMap;
  readonly taskMap = this._baseService.taskMap;
  readonly subtaskMap = this._baseService.subtaskMap;
  readonly commentMap = this._baseService.commentMap;

  get isLoading() {
    return this._baseService.isLoading;
  }

  get lastLoaded() {
    return this._baseService.lastLoaded;
  }

  /* ════════════════════════════════════════════════════════════════════════
     PAGINATION PROXIES
     ════════════════════════════════════════════════════════════════════════ */

  hasMoreTodos() {
    return this._paginationService.hasMoreTodos();
  }
  hasMoreTasks() {
    return this._paginationService.hasMoreTasks();
  }
  hasMoreSubtasks() {
    return this._paginationService.hasMoreSubtasks();
  }
  hasMoreComments() {
    return this._paginationService.hasMoreComments();
  }
  hasMoreChats() {
    return this._paginationService.hasMoreChats();
  }
  hasMoreCategories() {
    return this._paginationService.hasMoreCategories();
  }

  /* ════════════════════════════════════════════════════════════════════════
     LOADING STATE
     ════════════════════════════════════════════════════════════════════════ */

  isEntityLoading(type: EntityType): boolean {
    return this._baseService.isEntityLoading(type);
  }

  /* ════════════════════════════════════════════════════════════════════════
     HYDRATION PROXIES
     ════════════════════════════════════════════════════════════════════════ */

  ensureTodosLoaded(visibility: VisibilityFilter = "all", limit = 10) {
    this._paginationService.ensureTodosLoaded(visibility, limit);
  }

  ensureTasksLoaded(todoId?: string, visibility = "private", limit = 10) {
    this._paginationService.ensureTasksLoaded(todoId, visibility, limit);
  }

  ensureSubtasksLoaded(taskId?: string, visibility = "private", limit = 10) {
    this._paginationService.ensureSubtasksLoaded(taskId, visibility, limit);
  }

  ensureCategoriesLoaded(visibility: VisibilityFilter = "all", limit = 100) {
    this._paginationService.ensureCategoriesLoaded(visibility, limit);
  }

  ensureCommentsLoaded(taskId?: string, visibility = "private", limit = 10) {
    this._paginationService.ensureCommentsLoaded(taskId, visibility, limit);
  }

  ensureChatsLoaded(visibility = "private", limit = 50) {
    this._paginationService.ensureChatsLoaded(visibility, limit);
  }

  ensureRoomsLoaded() {
    this._paginationService.ensureRoomsLoaded();
  }

  ensureUserLoaded() {
    this._paginationService.ensureUserLoaded();
  }

  ensureProfileLoaded() {
    this._paginationService.ensureProfileLoaded();
  }

  loadAllProfiles() {
    this._paginationService.loadAllProfiles();
  }

  /* ════════════════════════════════════════════════════════════════════════
     LAZY GETTER PROXIES
     ════════════════════════════════════════════════════════════════════════ */

  getTodos(visibility: VisibilityFilter = "all"): Todo[] {
    return this._paginationService.getTodos(visibility);
  }

  getTasks(todoId?: string): Task[] {
    return this._paginationService.getTasks(todoId);
  }

  getSubtasks(taskId?: string): Subtask[] {
    return this._paginationService.getSubtasks(taskId);
  }

  getComments(taskId?: string, subtaskId?: string): Comment[] {
    return this._paginationService.getComments(taskId, subtaskId);
  }

  getCategories(): Category[] {
    return this._paginationService.getCategories();
  }

  getChats(): Chat[] {
    return this._paginationService.getChats();
  }

  getRooms(): Room[] {
    return this._paginationService.getRooms();
  }

  /* ════════════════════════════════════════════════════════════════════════
     LOAD MORE PROXIES
     ════════════════════════════════════════════════════════════════════════ */

  loadMoreTodos(visibility: VisibilityFilter = "all"): void {
    this._paginationService.loadMoreTodos(visibility);
  }

  loadMoreTasks(
    todoId?: string,
    visibility = "private",
    userId?: string,
    assigneeId?: string
  ): void {
    this._paginationService.loadMoreTasks(todoId, visibility, userId, assigneeId);
  }

  loadMoreSubtasks(taskId?: string): void {
    this._paginationService.loadMoreSubtasks(taskId);
  }

  loadMoreCategories(): void {
    this._paginationService.loadMoreCategories();
  }

  loadMoreComments(taskId?: string): void {
    this._paginationService.loadMoreComments(taskId);
  }

  loadMoreChats(): void {
    this._paginationService.loadMoreChats();
  }

  /* ════════════════════════════════════════════════════════════════════════
     OPTIMISTIC CRUD OPERATIONS
     ════════════════════════════════════════════════════════════════════════ */

  createEntity(type: EntityType, data: any): Observable<any> {
    const previousState = this._baseService.getEntitySignal(type)();
    this.addEntity(type, data);

    return this._apiService.crud<any>(this._baseService.getRoute(type, "create")!, { data }).pipe(
      tap((result) => {
        if (result?.id) {
          this._baseService.updateEntitySignal(type, result.id, result);
        }
      }),
      catchError((error) => {
        this._baseService.setEntitySignal(type, previousState);
        this._baseService._notifyService.showError(`Failed to create: ${error.message}`);
        throw error;
      })
    );
  }

  updateEntity(type: EntityType, id: string, data: Partial<any>): Observable<any> {
    const previousState = this._baseService.getEntitySignal(type)();

    this._baseService
      .getEntitySignal(type)
      .update((items: any[]) =>
        items.map((item: any) => (item.id === id ? { ...item, ...data } : item))
      );

    return this._apiService
      .crud<any>(this._baseService.getRoute(type, "update")!, { id, data })
      .pipe(
        catchError((error) => {
          this._baseService.setEntitySignal(type, previousState);
          this._baseService._notifyService.showError(`Failed to update: ${error.message}`);
          throw error;
        })
      );
  }

  deleteEntity(type: EntityType, id: string): Observable<void> {
    const previousState = this._baseService.getEntitySignal(type)();

    this._baseService
      .getEntitySignal(type)
      .update((items: any[]) => items.filter((item: any) => item.id !== id));

    return this._apiService.crud<void>(this._baseService.getRoute(type, "delete")!, { id }).pipe(
      catchError((error) => {
        this._baseService.setEntitySignal(type, previousState);
        this._baseService._notifyService.showError(`Failed to delete: ${error.message}`);
        throw error;
      })
    );
  }

  /* ════════════════════════════════════════════════════════════════════════
     CHAT PROXIES
     ════════════════════════════════════════════════════════════════════════ */

  sendMessage(content: string, roomId: string, replyId?: string) {
    return this._chatService.sendMessage(content, roomId, replyId);
  }

  editMessage(messageId: string, content: string) {
    return this._chatService.editMessage(messageId, content);
  }

  deleteMessage(messageId: string) {
    return this._chatService.deleteMessage(messageId);
  }

  createGroup(name: string) {
    return this._chatService.createGroup(name);
  }

  addGroupMembers(roomId: string, memberIds: string[]) {
    return this._chatService.addGroupMembers(roomId, memberIds);
  }

  removeGroupMembers(roomId: string, memberId: string) {
    return this._chatService.removeGroupMembers(roomId, memberId);
  }

  deleteGroup(roomId: string) {
    return this._chatService.deleteGroup(roomId);
  }

  selectConversation(roomId: string) {
    this._chatService.selectConversation(roomId);
  }

  loadMessagesForRoom(roomId: string, skip = 0, limit = 100) {
    this._chatService.loadMessagesForRoom(roomId, skip, limit);
  }

  loadConversationsFromChats() {
    this._chatService.loadConversationsFromChats();
  }

  loadGroups() {
    this._chatService.loadGroups();
  }

  updateChatByTempId(tempId: string, cloudId: string, syncStatus: "pending" | "synced" | "failed") {
    this._chatService.updateChatByTempId(tempId, cloudId, syncStatus);
  }

  updateChatSyncStatus(tempId: string, syncStatus: "pending" | "synced" | "failed") {
    this._chatService.updateChatSyncStatus(tempId, syncStatus);
  }

  updateConversationLastMessage(roomId: string, message: string) {
    this._chatService.updateConversationLastMessage(roomId, message);
  }

  /* ════════════════════════════════════════════════════════════════════════
     BATCH OPERATIONS
     ════════════════════════════════════════════════════════════════════════ */

  batchSoftDelete(table: string, ids: string[], visibility?: string): Observable<any[]> {
    return from(this._apiService.batchSoftDelete(table, ids, visibility));
  }

  batchHardDelete(table: string, ids: string[], visibility?: string): Observable<any[]> {
    return from(this._apiService.batchHardDelete(table, ids, visibility));
  }

  batchRestore(table: string, ids: string[], visibility?: string): Observable<any[]> {
    return from(this._apiService.batchRestore(table, ids, visibility));
  }

  /* ════════════════════════════════════════════════════════════════════════
     ENTITY MANAGEMENT PROXIES
     ════════════════════════════════════════════════════════════════════════ */

  addEntity(type: EntityType, data: any): void {
    this._baseService.addEntity(type, data);
  }

  updateEntitySignal(type: EntityType, _id: string, data: any): void {
    this._baseService.updateEntitySignal(type, _id, data);
  }

  removeEntity(type: EntityType, id: string): void {
    this._baseService.removeEntity(type, id);
  }

  /* ════════════════════════════════════════════════════════════════════════
     UTILITY METHODS
     ════════════════════════════════════════════════════════════════════════ */

  currentUserId(): string {
    return this._baseService.currentUserId();
  }

  getUsername(userId: string): string {
    return this._baseService.getUsername(userId);
  }

  private updatePagination(type: ChildType, skip: number, limit: number, receivedCount: number) {
    this._baseService.updatePagination(type, skip, limit, receivedCount);
  }

  clear(): void {
    this.todos.set([]);
    this.tasks.set([]);
    this.subtasks.set([]);
    this.comments.set([]);
    this.chats.set([]);
    this.categories.set([]);
    this.profiles.set([]);
    this.publicProfiles.set([]);
    this.users.set([]);
    this.currentUser.set(null);
    this.rooms.set([]);
    this.conversations.set([]);
    this.messages.set([]);
    this.activeConversationId.set(null);
    this._baseService._loaded.set(false);
    this._baseService._lastLoaded.set(null);
    this._baseService._pagination.set({
      todos: { ...DEFAULT_PAGINATION },
      tasks: { ...DEFAULT_PAGINATION },
      subtasks: { ...DEFAULT_PAGINATION },
      categories: { ...DEFAULT_PAGINATION },
      comments: { ...DEFAULT_PAGINATION },
      chats: { ...DEFAULT_PAGINATION },
    });
  }

  setRooms(rooms: Room[]): void {
    this.rooms.set(rooms);
  }

  setChats(chats: Chat[]): void {
    this._chatService.setChats(chats);
  }

  addChat(chat: Chat): void {
    this._chatService.addChat(chat);
  }

  clearChatState(): void {
    this._chatService.clearChatState();
  }
}
