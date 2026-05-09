import { Injectable, inject, computed } from "@angular/core";
import { StorageStateService } from "./storage-state.service";
import { Todo } from "@models/todo.model";
import { Task, TaskStatus } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import { Comment } from "@models/comment.model";
import { Chat } from "@models/chat.model";

@Injectable({ providedIn: "root" })
export class StorageQueryService {
  private state = inject(StorageStateService);

  getTodoById(id: string): Todo | undefined {
    return this.state.todoMap().get(id);
  }

  getTaskById(id: string): Task | undefined {
    return this.state.taskMap().get(id);
  }

  getSubtaskById(id: string): Subtask | undefined {
    return this.state.subtaskMap().get(id);
  }

  getCommentById(id: string): Comment | undefined {
    return this.state.commentMap().get(id);
  }

  getTasksByTodoId(todo_id: string): Task[] {
    return this.state.tasksByTodoId().get(todo_id) || [];
  }

  getSubtasksByTaskId(task_id: string): Subtask[] {
    return this.state.subtasksByTaskId().get(task_id) || [];
  }

  getCommentsByTaskId(task_id: string): Comment[] {
    return this.state.commentsByTaskId().get(task_id) || [];
  }

  getCommentsBySubtaskId(subtask_id: string): Comment[] {
    return this.state.commentsBySubtaskId().get(subtask_id) || [];
  }

  getChatsByTodoId(todo_id: string): Chat[] {
    return this.state.chatsByTodoId().get(todo_id) || [];
  }

  getChatsByTodo(todo_id?: string): Chat[] {
    if (!todo_id) return [];
    return this.state.chats().filter((c) => c.todo_id === todo_id);
  }

  getTodos(visibility: "all" | "private" | "shared" | "public" = "all"): Todo[] {
    switch (visibility) {
      case "private":
        return this.state.privateTodos();
      case "shared":
        return this.state.sharedTodos();
      case "public":
        return this.state.publicTodos();
      case "all":
      default:
        return this.state.todos();
    }
  }

  getTasks(todoId?: string, _visibility?: "all" | "private" | "shared" | "public"): Task[] {
    if (todoId) {
      return this.getTasksByTodoId(todoId);
    }
    return this.state.tasks();
  }

  getSubtasks(taskId?: string): Subtask[] {
    if (taskId) {
      return this.getSubtasksByTaskId(taskId);
    }
    return this.state.subtasks();
  }

  getComments(taskId?: string, subtaskId?: string): Comment[] {
    if (taskId) {
      return this.getCommentsByTaskId(taskId);
    }
    if (subtaskId) {
      return this.getCommentsBySubtaskId(subtaskId);
    }
    return this.state.comments();
  }

  getChats(todoId?: string): Chat[] {
    if (todoId) {
      return this.getChatsByTodoId(todoId);
    }
    return this.state.chats();
  }

  isPrivateData(entity: any): boolean {
    return entity?.visibility === "private";
  }

  canAccessOffline(visibility: "all" | "private" | "shared" | "public"): boolean {
    return visibility === "private";
  }

  getTodosWithNestedTasks(): Todo[] {
    const todos = this.state.todos();
    const tasksByTodo = this.state.tasksByTodoId();
    return todos.map((todo) => ({
      ...todo,
      tasks: tasksByTodo.get(todo.id) || [],
    }));
  }

  getTasksWithNestedSubtasks(): Task[] {
    const tasks = this.state.tasks();
    const subtasksByTask = this.state.subtasksByTaskId();
    return tasks.map((task) => ({
      ...task,
      subtasks: subtasksByTask.get(task.id) || [],
    }));
  }

  getSubtasksWithNestedComments(): Subtask[] {
    const subtasks = this.state.subtasks();
    const commentsBySubtask = this.state.commentsBySubtaskId();
    return subtasks.map((subtask) => ({
      ...subtask,
      comments: commentsBySubtask.get(subtask.id) || [],
    }));
  }

  getAllByParentId<T extends "tasks" | "subtasks">(
    entityType: T,
    parentId: string
  ): T extends "tasks" ? Task[] : Subtask[] {
    if (entityType === "tasks") {
      return this.getTasksByTodoId(parentId) as any;
    }
    return this.getSubtasksByTaskId(parentId) as any;
  }

  getUnreadChatCount(todoId: string, userId: string): number {
    const chats = this.getChatsByTodoId(todoId).filter((c: Chat) => !c.deleted_at);
    return chats.filter((c: Chat) => !c.read_by || !c.read_by.includes(userId)).length;
  }

  getUsername(userId: string): string {
    const user = this.state._users().find((u) => u.id === userId);
    const userAny = user as any;
    if (userAny?.profile?.name) {
      return `${userAny.profile.name} ${userAny.profile.last_name || ""}`.trim();
    }
    const profile = this.state._profiles().find((p) => p.user_id === userId);
    if (profile?.name) {
      return `${profile.name} ${profile.last_name || ""}`.trim();
    }
    if (user?.username) return user.username;
    return "Unknown";
  }

  getTodoReactive(todo_id?: string): ReturnType<typeof computed<Todo | undefined>> {
    if (!todo_id) {
      return computed(() => undefined);
    }

    if (this.state.todoComputedCache.has(todo_id)) {
      return this.state.todoComputedCache.get(todo_id)!;
    }

    const computedSignal = computed(() => {
      return this.state.todos().find((t) => t.id === todo_id);
    });

    this.state.todoComputedCache.set(todo_id, computedSignal);
    return computedSignal;
  }

  getTaskReactive(task_id?: string): ReturnType<typeof computed<Task | undefined>> {
    if (!task_id) {
      return computed(() => undefined);
    }

    if (this.state.taskComputedCache.has(task_id)) {
      return this.state.taskComputedCache.get(task_id)!;
    }

    const computedSignal = computed(() => {
      return this.state.tasks().find((t) => t.id === task_id);
    });

    this.state.taskComputedCache.set(task_id, computedSignal);
    return computedSignal;
  }

  getTasksByTodoIdSignal(todo_id?: string): Task[] {
    if (!todo_id) return [];
    return this.state.tasks().filter((t) => t.todo_id === todo_id);
  }

  getSubtasksByTaskIdArray(task_id?: string): Subtask[] {
    if (!task_id) return [];
    return this.state.subtasks().filter((s) => s.task_id === task_id);
  }

  getSubtasksByTaskIdReactive(task_id?: string): ReturnType<typeof computed<Subtask[]>> {
    return computed(() => this.state.subtasks().filter((subtask) => subtask.task_id === task_id));
  }

  subtaskCountByTaskId(task_id?: string): ReturnType<typeof computed<number>> {
    return computed(
      () => this.state.subtasks().filter((subtask) => subtask.task_id === task_id).length
    );
  }

  subtaskExists(id: string): boolean {
    return this.state.subtasks().some((s) => s.id === id);
  }

  get pendingTasksCount(): number {
    return this.state.tasks().filter((t) => t.status === TaskStatus.PENDING).length;
  }
}
