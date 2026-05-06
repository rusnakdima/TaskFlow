import { Injectable, inject } from "@angular/core";
import { Observable } from "rxjs";

import { Response } from "@models/response.model";
import { Todo } from "@models/todo.model";
import { Task } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import { Category } from "@models/category.model";
import { Comment } from "@models/comment.model";
import { Chat } from "@models/chat.model";
import { Profile } from "@models/profile.model";

import { RequestService } from "@services/core/request.service";
import { StorageService } from "@services/core/storage.service";

@Injectable({ providedIn: "root" })
export class DataService {
  private requestService = inject(RequestService);
  private storageService = inject(StorageService);

  isOffline(): boolean {
    return this.requestService.isOffline();
  }

  getTodos(options?: {
    filter?: any;
    skip?: number;
    limit?: number;
    load?: string[];
    visibility?: string;
  }): Observable<Todo[]> {
    return this.requestService.getTodos(options);
  }

  getTodo(id: string): Observable<Todo> {
    return this.requestService.getTodo(id);
  }

  createTodo(data: Partial<Todo>, visibility?: string): Observable<Todo> {
    return this.requestService.createTodo(data, visibility);
  }

  updateTodo(id: string, data: Partial<Todo>, visibility?: string): Observable<Todo> {
    return this.requestService.updateTodo(id, data, visibility);
  }

  deleteTodo(id: string, visibility?: string): Observable<void> {
    return this.requestService.deleteTodo(id, visibility);
  }

  getTasks(todoId?: string, filter?: any): Observable<Task[]> {
    return this.requestService.getTasks(todoId, filter);
  }

  getTask(id: string): Observable<Task> {
    return this.requestService.getTask(id);
  }

  createTask(data: Partial<Task>, visibility?: string): Observable<Task> {
    return this.requestService.createTask(data, visibility);
  }

  updateTask(id: string, data: Partial<Task>, visibility?: string): Observable<Task> {
    return this.requestService.updateTask(id, data, visibility);
  }

  deleteTask(id: string, visibility?: string): Observable<void> {
    return this.requestService.deleteTask(id, visibility);
  }

  getSubtasks(taskId?: string): Observable<Subtask[]> {
    return this.requestService.getSubtasks(taskId);
  }

  getSubtask(id: string): Observable<Subtask> {
    return this.requestService.getSubtask(id);
  }

  createSubtask(data: Partial<Subtask>, visibility?: string): Observable<Subtask> {
    return this.requestService.createSubtask(data, visibility);
  }

  updateSubtask(id: string, data: Partial<Subtask>, visibility?: string): Observable<Subtask> {
    return this.requestService.updateSubtask(id, data, visibility);
  }

  deleteSubtask(id: string, visibility?: string): Observable<void> {
    return this.requestService.deleteSubtask(id, visibility);
  }

  getCategories(): Observable<Category[]> {
    return this.requestService.getCategories();
  }

  getComments(taskId?: string, subtaskId?: string): Observable<Comment[]> {
    return this.requestService.getComments(taskId, subtaskId);
  }

  getChats(todoId: string): Observable<Chat[]> {
    return this.requestService.getChats(todoId);
  }

  getUser(id: string): Observable<any> {
    return this.requestService.getUser(id);
  }

  getProfile(): Observable<Profile | null> {
    return this.requestService.getProfile();
  }

  getPublicProfiles(): Observable<Profile[]> {
    return this.requestService.getPublicProfiles();
  }

  updateComment(id: string, data: Partial<Comment>, visibility?: string): Observable<Comment> {
    return this.requestService.updateComment(id, data, visibility);
  }

  updateProfile(id: string, data: Partial<Profile>, visibility?: string): Observable<Profile> {
    return this.requestService.updateProfile(id, data, visibility);
  }

  createProfile(data: Partial<Profile>, visibility?: string): Observable<Profile> {
    return this.requestService.createProfile(data, visibility);
  }

  setChatsForTodo(chats: Chat[], todoId: string): void {
    const filtered = this.storageService.chats().filter((c: Chat) => c.todo_id !== todoId);
    this.storageService.setCollection("chats", [...filtered, ...chats]);
  }

  getTasksByTodoId(todoId: string): Task[] {
    return this.storageService.getTasksByTodoId(todoId);
  }

  getSubtasksByTaskId(taskId: string): Subtask[] {
    return this.storageService.getSubtasksByTaskId(taskId);
  }

  getCommentsByTaskId(taskId: string): Comment[] {
    return this.storageService.comments().filter((c: Comment) => c.task_id === taskId);
  }

  getCommentsBySubtaskId(subtaskId: string): Comment[] {
    return this.storageService.comments().filter((c: Comment) => c.subtask_id === subtaskId);
  }

  initializeUserData(userId: string): Observable<Response<any>> {
    return this.requestService.initializeUserData(userId);
  }

  getEntitiesByType<T>(entityName: string, options: any): Observable<T[]> {
    return this.requestService.getEntitiesByType<T>(entityName, options);
  }

  getTasksByMonth(year: number, month: number): Observable<{ tasks: Task[] }> {
    return this.requestService.getTasksByMonth(year, month);
  }

  filterTodosByVisibility(todos: Todo[], visibility: string): Todo[] {
    return this.requestService.filterTodosByVisibility(todos, visibility);
  }
}
