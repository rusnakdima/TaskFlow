/**
 * Relation Resolver Service
 *
 * Provides denormalized views of entities with their relations resolved.
 * This service combines data from multiple stores to create complete entity views.
 *
 * Usage:
 * ```typescript
 * // Get todo with all relations
 * const todoWithRelations = relationResolver.resolveTodoWithRelations(todoId);
 *
 * // Get tasks for todo (memoized signal)
 * const tasksSignal = relationResolver.getTasksForTodo(todoId);
 * ```
 */

import { Injectable, computed, Signal } from "@angular/core";
import { Todo } from "@models/todo.model";
import { Task } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import { Comment } from "@models/comment.model";
import { Category } from "@models/category.model";
import { Profile } from "@models/profile.model";

import {
  TodoStore,
  TaskStore,
  SubtaskStore,
  CommentStore,
  CategoryStore,
  ProfileStore,
} from "@stores/index";

/**
 * Todo with all relations resolved
 */
export interface TodoWithRelations extends Todo {
  tasks: TaskWithRelations[];
  categories: Category[];
  assigneesProfiles: Profile[];
}

/**
 * Task with relations resolved
 */
export interface TaskWithRelations extends Task {
  subtasks: SubtaskWithRelations[];
  comments: Comment[];
}

/**
 * Subtask with relations resolved
 */
export interface SubtaskWithRelations extends Subtask {
  comments: Comment[];
}

@Injectable({
  providedIn: "root",
})
export class RelationResolverService {
  constructor(
    private todoStore: TodoStore,
    private taskStore: TaskStore,
    private subtaskStore: SubtaskStore,
    private commentStore: CommentStore,
    private categoryStore: CategoryStore,
    private profileStore: ProfileStore
  ) {}

  // ==================== TODO RELATIONS ====================

  /**
   * Resolve a single todo with all its relations
   */
  resolveTodoWithRelations(todoId: string): Signal<TodoWithRelations | undefined> {
    return computed(() => {
      const todo = this.todoStore.todoById(todoId);
      if (!todo) return undefined;

      const tasks = this.getTasksForTodo(todoId)();
      const categories = this.getCategoriesForTodo(todoId)();
      const assigneesProfiles = this.getAssigneesForTodo(todoId)();

      return {
        ...todo,
        tasks,
        categories,
        assigneesProfiles,
      };
    });
  }

  /**
   * Get tasks for a todo (memoized signal)
   */
  getTasksForTodo(todoId: string): Signal<TaskWithRelations[]> {
    return computed(() => {
      const tasks = this.taskStore.tasksByTodoId(todoId)();
      return tasks.map((task) => this.resolveTaskWithRelations(task.id)());
    });
  }

  /**
   * Get categories for a todo
   * Note: Categories are stored in the todo object itself in the current implementation
   */
  getCategoriesForTodo(todoId: string): Signal<Category[]> {
    return computed(() => {
      const todo = this.todoStore.todoById(todoId);
      return todo?.categories || [];
    });
  }

  /**
   * Get assignees (profiles) for a todo
   * Note: Assignees are stored in the todo object itself
   */
  getAssigneesForTodo(todoId: string): Signal<Profile[]> {
    return computed(() => {
      const todo = this.todoStore.todoById(todoId);
      return todo?.assigneesProfiles || [];
    });
  }

  /**
   * Get all todos with their relations resolved
   */
  readonly allTodosWithRelations: Signal<TodoWithRelations[]> = computed(() => {
    const todos = this.todoStore.todos();
    return todos
      .map((todo) => this.resolveTodoWithRelations(todo.id)())
      .filter((todo): todo is TodoWithRelations => todo !== undefined);
  });

  // ==================== TASK RELATIONS ====================

  /**
   * Resolve a single task with all its relations
   */
  resolveTaskWithRelations(taskId: string): Signal<TaskWithRelations> {
    return computed(() => {
      const task = this.taskStore.taskById(taskId);
      if (!task) {
        // Return a minimal task object if not found
        return {
          id: "",
          todoId: "",
          title: "",
          description: "",
          status: "pending",
          order: 0,
          deleted_at: null,
          subtasks: [],
          comments: [],
        } as any as TaskWithRelations;
      }

      const subtasks = this.getSubtasksForTask(taskId)();
      const comments = this.getCommentsForTask(taskId)();

      return {
        ...task,
        subtasks,
        comments,
      };
    });
  }

  /**
   * Get subtasks for a task (memoized signal)
   */
  getSubtasksForTask(taskId: string): Signal<SubtaskWithRelations[]> {
    return computed(() => {
      const subtasks = this.subtaskStore.subtasksByTaskId(taskId)();
      return subtasks.map((subtask) => this.resolveSubtaskWithRelations(subtask.id)());
    });
  }

  /**
   * Get comments for a task (including subtask comments)
   */
  getCommentsForTask(taskId: string): Signal<Comment[]> {
    return computed(() => {
      // Get direct task comments
      const taskComments = this.commentStore.commentsByTaskId(taskId)();

      // Get subtask comments
      const subtasks = this.subtaskStore.subtasksByTaskId(taskId)();
      const subtaskComments = subtasks.flatMap((subtask) =>
        this.commentStore.commentsBySubtaskId(subtask.id)()
      );

      return [...taskComments, ...subtaskComments];
    });
  }

  // ==================== SUBTASK RELATIONS ====================

  /**
   * Resolve a single subtask with all its relations
   */
  resolveSubtaskWithRelations(subtaskId: string): Signal<SubtaskWithRelations> {
    return computed(() => {
      const subtask = this.subtaskStore.subtaskById(subtaskId);
      if (!subtask) {
        return {
          id: "",
          taskId: "",
          title: "",
          description: "",
          deleted_at: null,
          order: 0,
          comments: [],
        } as any as SubtaskWithRelations;
      }

      const comments = this.commentStore.commentsBySubtaskId(subtaskId)();

      return {
        ...subtask,
        comments,
      };
    });
  }

  // ==================== UTILITY METHODS ====================

  /**
   * Get todo with minimal relations (for list views)
   */
  resolveTodoMinimal(todoId: string): Signal<Partial<TodoWithRelations>> {
    return computed(() => {
      const todo = this.todoStore.todoById(todoId);
      if (!todo) return {};

      return {
        ...todo,
        tasks: [], // Don't load tasks for minimal view
        categories: todo.categories || [],
        assigneesProfiles: [],
      };
    });
  }

  /**
   * Get todo with tasks only (no subtasks/comments - for kanban views)
   */
  resolveTodoWithTasksOnly(todoId: string): Signal<Partial<TodoWithRelations>> {
    return computed(() => {
      const todo = this.todoStore.todoById(todoId);
      if (!todo) return {};

      const tasks = this.taskStore.tasksByTodoId(todoId)();

      return {
        ...todo,
        tasks: tasks.map((task) => ({
          ...task,
          subtasks: [], // Don't load subtasks for kanban
          comments: [],
        })),
      };
    });
  }

  /**
   * Check if todo has all relations loaded
   */
  hasAllRelations(todoId: string): boolean {
    const todo = this.todoStore.todoById(todoId);
    if (!todo) return false;

    const hasTasks = this.taskStore.taskCountByTodoId(todoId)() > 0;
    const hasCategories = (todo.categories?.length ?? 0) > 0;
    const hasAssignees = (todo.assigneesProfiles?.length ?? 0) > 0;

    return hasTasks || hasCategories || hasAssignees;
  }

  /**
   * Get relation loading status for a todo
   */
  getRelationStatus(todoId: string): {
    hasTasks: boolean;
    hasSubtasks: boolean;
    hasComments: boolean;
    hasCategories: boolean;
    hasAssignees: boolean;
  } {
    const todo = this.todoStore.todoById(todoId);
    if (!todo) {
      return {
        hasTasks: false,
        hasSubtasks: false,
        hasComments: false,
        hasCategories: false,
        hasAssignees: false,
      };
    }

    const tasks = this.taskStore.tasksByTodoId(todoId)();
    const hasTasks = tasks.length > 0;

    const hasSubtasks = tasks.some((task) => {
      const subtasks = this.subtaskStore.subtasksByTaskId(task.id)();
      return subtasks.length > 0;
    });

    const hasComments = this.commentStore
      .comments()
      .some((comment) => comment.taskId === todoId || comment.subtaskId !== undefined);

    return {
      hasTasks,
      hasSubtasks,
      hasComments,
      hasCategories: (todo.categories?.length ?? 0) > 0,
      hasAssignees: (todo.assigneesProfiles?.length ?? 0) > 0,
    };
  }
}
