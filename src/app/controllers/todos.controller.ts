/* sys lib */
import { Injectable } from "@angular/core";
import { Observable } from "rxjs";

/* models */
import { Todo } from "@models/todo.model";
import { Task, TaskStatus } from "@models/task.model";
import { Subtask } from "@models/subtask.model";

/* services */
import { NotifyService } from "@services/notify.service";
import { TemplateService, ProjectTemplate } from "@services/template.service";
import { StorageService } from "@services/storage.service";

/* providers */
import { DataSyncProvider } from "@providers/data-sync.provider";

/**
 * TodosController - Business logic for TodosView
 * Handles all todo operations, filtering, and blueprint management
 */
@Injectable()
export class TodosController {
  constructor(
    private dataSyncProvider: DataSyncProvider,
    private notifyService: NotifyService,
    public templateService: TemplateService,
    private storageService: StorageService
  ) {}

  userId: string = "";

  /**
   * Initialize controller with user ID
   */
  init(userId: string): void {
    this.userId = userId;
  }

  /**
   * Load all todos for user (from StorageService cache)
   */
  loadTodos(): Observable<Todo[]> {
    // Use storage service which loads todos with relations
    return new Observable<Todo[]>((observer) => {
      const todos = this.storageService.todos();
      observer.next(todos);
      observer.complete();
    });
  }

  /**
   * Delete todo by ID
   */
  deleteTodoById(todoId: string, onSuccess: () => void): void {
    this.dataSyncProvider.delete("todo", todoId, { isOwner: true, isPrivate: true }).subscribe({
      next: () => {
        // Update storage service cache
        this.storageService.removeTodo(todoId);
        this.notifyService.showSuccess("Todo deleted successfully");
        onSuccess();
      },
      error: (err) => {
        this.notifyService.showError(err.message || "Failed to delete todo");
      },
    });
  }

  /**
   * Update todo order
   */
  updateTodoOrder(todos: Todo[], onComplete: (success: boolean) => void): void {
    const transformedTodos = todos.map((todo) => ({
      _id: todo._id,
      id: todo.id,
      userId: todo.userId || "",
      title: todo.title,
      description: todo.description,
      startDate: todo.startDate,
      endDate: todo.endDate,
      categories: todo.categories?.map((cat) => cat.id) || [],
      assignees: todo.assignees?.map((assignee) => assignee.id) || [],
      visibility: todo.visibility,
      order: todo.order,
      isDeleted: todo.isDeleted,
      createdAt: todo.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString().split(".")[0],
    }));

    this.dataSyncProvider
      .updateAll<string>("todo", transformedTodos, { isOwner: true, isPrivate: true })
      .subscribe({
        next: () => {
          // Update storage service cache with new order
          this.storageService.todosSignalAccessor.set(todos);
          this.notifyService.showSuccess("Order updated successfully");
          onComplete(true);
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to update order");
          onComplete(false);
        },
        complete: () => {},
      });
  }

  /**
   * Update two todo order (for drag-drop swap)
   */
  updateTwoTodoOrder(todo1: Todo, todo2: Todo, onComplete: () => void): void {
    let completedCount = 0;

    [todo1, todo2].forEach((todo) => {
      this.dataSyncProvider
        .update<Todo>("todo", todo.id, { order: todo.order }, { isOwner: true, isPrivate: true })
        .subscribe({
          next: () => {
            completedCount++;
            if (completedCount === 2) {
              // Update storage service cache
              this.storageService.updateTodo(todo1.id, { order: todo1.order });
              this.storageService.updateTodo(todo2.id, { order: todo2.order });
              this.notifyService.showSuccess("Project order updated successfully");
              onComplete();
            }
          },
          error: (err) => {
            this.notifyService.showError(err.message || "Failed to update project order");
          },
        });
    });
  }

  /**
   * Save todo as blueprint
   */
  saveAsBlueprint(todo: Todo, name: string, description: string, onSuccess: () => void): void {
    if (!todo || !name) {
      this.notifyService.showError("Todo and name are required");
      return;
    }

    const template = this.templateService.createTemplateFromTodo(todo, name, description);
    this.notifyService.showSuccess(`Project saved as "${name}" Blueprint`);
    onSuccess();
  }

  /**
   * Create todo from blueprint
   */
  createFromBlueprint(template: ProjectTemplate, title: string, onSuccess: () => void): void {
    if (!template || !title) {
      this.notifyService.showError("Template and title are required");
      return;
    }

    const todo: Todo = {
      id: `todo-${Date.now()}`,
      title,
      description: template.description,
      isDeleted: false,
      userId: this.userId,
      user: { id: this.userId } as any,
      visibility: "private",
      categories: [],
      tasks: [],
      assignees: [],
      order: 0,
      startDate: "",
      endDate: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const clientTodoId = todo.id;

    this.dataSyncProvider.create<Todo>("todo", todo, { isOwner: true, isPrivate: true }).subscribe({
      next: (createdTodo) => {
        const todoId = clientTodoId;
        const tasks = this.templateService.applyTemplate(template, todoId, this.userId);

        if (tasks.length === 0) {
          this.notifyService.showSuccess("Project created from Blueprint!");
          onSuccess();
          return;
        }

        let createdTasksCount = 0;

        tasks.forEach((task, taskIndex) => {
          const { subtasks, ...taskWithoutSubtasks } = task;
          const clientTaskId = task.id;

          this.dataSyncProvider
            .create<Task>("task", taskWithoutSubtasks, { isOwner: true, isPrivate: true }, todoId)
            .subscribe({
              next: () => {
                const taskId = clientTaskId;
                const subtasks = task.subtasks || [];

                if (subtasks.length === 0) {
                  createdTasksCount++;
                  if (createdTasksCount === tasks.length) {
                    this.notifyService.showSuccess("Project created from Blueprint with tasks!");
                    onSuccess();
                  }
                  return;
                }

                let createdSubtasksCount = 0;

                subtasks.forEach((subtask: any) => {
                  const subtaskWithActualTaskId = {
                    ...subtask,
                    taskId: taskId,
                    todoId: todoId,
                  };

                  this.dataSyncProvider
                    .create<any>(
                      "subtask",
                      subtaskWithActualTaskId,
                      { isOwner: true, isPrivate: true },
                      todoId
                    )
                    .subscribe({
                      next: () => {
                        createdSubtasksCount++;
                        if (createdSubtasksCount === subtasks.length) {
                          createdTasksCount++;
                          if (createdTasksCount === tasks.length) {
                            setTimeout(() => {
                              onSuccess();
                            }, 500);
                          }
                        }
                      },
                      error: (err) => {
                        this.notifyService.showError(err.message || "Failed to create subtask");
                      },
                    });
                });
              },
              error: (err) => {
                this.notifyService.showError(err.message || "Failed to create task");
              },
            });
        });
      },
      error: (err) => {
        this.notifyService.showError(err.message || "Failed to create project");
      },
    });
  }

  /**
   * Check if todo is completed
   */
  isCompleted(todo: Todo): boolean {
    const listTasks = todo?.tasks ?? [];
    const listCompletedTasks = listTasks.filter(
      (task: Task) => task.status === TaskStatus.COMPLETED || task.status === TaskStatus.SKIPPED
    );
    return listCompletedTasks.length === listTasks.length;
  }
}
