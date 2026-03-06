/* sys lib */
import { Injectable } from "@angular/core";

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
   * Delete todo by ID - Optimistic update with rollback on failure
   */
  deleteTodoById(todoId: string, onSuccess: () => void): void {
    // Get the todo before deleting for potential rollback
    const todoToDelete = this.storageService.getTodoById(todoId);
    
    // Optimistic update: remove from cache immediately
    this.storageService.removeTodo(todoId);
    this.notifyService.showSuccess("Todo deleted successfully");
    onSuccess();

    // Send to backend
    this.dataSyncProvider.delete("todos", todoId, { isOwner: true, isPrivate: true }).subscribe({
      next: () => {
        // Success - cache already updated
      },
      error: (err) => {
        // Rollback on failure
        if (todoToDelete) {
          this.storageService.rollbackRemoveTodo(todoToDelete);
        }
        this.notifyService.showError(err.message || "Failed to delete todo");
      },
    });
  }

  /**
   * Update todo order - Optimistic update with rollback on failure
   */
  updateTodoOrder(todos: Todo[], onComplete: (success: boolean) => void): void {
    // Store previous state for rollback
    const previousTodos = todos.map(todo => ({ ...todo }));
    
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

    // Optimistic update: update cache immediately
    this.storageService.todosSignalAccessor.set(todos);
    this.notifyService.showSuccess("Order updated successfully");
    onComplete(true);

    // Send to backend
    this.dataSyncProvider
      .updateAll<string>("todos", transformedTodos, { isOwner: true, isPrivate: true })
      .subscribe({
        next: () => {
          // Success - cache already updated
        },
        error: (err) => {
          // Rollback on failure
          this.storageService.todosSignalAccessor.set(previousTodos);
          this.notifyService.showError(err.message || "Failed to update order");
        },
        complete: () => {},
      });
  }

  /**
   * Update two todo order (for drag-drop swap) - Optimistic update with rollback on failure
   */
  updateTwoTodoOrder(todo1: Todo, todo2: Todo, onComplete: () => void): void {
    // Store previous state for rollback
    const previousTodo1Order = todo1.order;
    const previousTodo2Order = todo2.order;
    
    let completedCount = 0;
    let hasError = false;

    // Optimistic update: update cache immediately
    this.storageService.updateTodo(todo1.id, { order: todo1.order });
    this.storageService.updateTodo(todo2.id, { order: todo2.order });

    [todo1, todo2].forEach((todo) => {
      this.dataSyncProvider
        .update<Todo>("todos", todo.id, { order: todo.order }, { isOwner: true, isPrivate: true })
        .subscribe({
          next: () => {
            completedCount++;
            if (completedCount === 2) {
              if (!hasError) {
                this.notifyService.showSuccess("Project order updated successfully");
                onComplete();
              }
            }
          },
          error: (err) => {
            hasError = true;
            // Rollback on failure
            this.storageService.updateTodo(todo1.id, { order: previousTodo1Order });
            this.storageService.updateTodo(todo2.id, { order: previousTodo2Order });
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
   * Create todo from blueprint - Optimistic update with rollback on failure
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

    // Optimistic update: add to cache immediately
    this.storageService.addTodo(todo);

    this.dataSyncProvider.create<Todo>("todos", todo, { isOwner: true, isPrivate: true }).subscribe({
      next: (createdTodo) => {
        // Update the cached todo with the real ID from backend
        this.storageService.updateTodo(clientTodoId, { id: createdTodo.id });

        const todoId = createdTodo.id;
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

          // Optimistic update: add task to cache
          this.storageService.addTask(task);

          this.dataSyncProvider
            .create<Task>("tasks", taskWithoutSubtasks, { isOwner: true, isPrivate: true }, todoId)
            .subscribe({
              next: (createdTask) => {
                // Update the cached task with the real ID from backend
                this.storageService.updateTask(clientTaskId, { id: createdTask.id, todoId: createdTask.todoId });

                const taskId = createdTask.id;
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

                  // Optimistic update: add subtask to cache
                  this.storageService.addSubtask(subtask);

                  this.dataSyncProvider
                    .create<any>(
                      "subtasks",
                      subtaskWithActualTaskId,
                      { isOwner: true, isPrivate: true },
                      todoId
                    )
                    .subscribe({
                      next: (createdSubtask) => {
                        // Update the cached subtask with the real ID from backend
                        this.storageService.updateSubtask(subtask.id, { 
                          id: createdSubtask.id,
                          taskId: createdSubtask.taskId
                        });
                        
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
        // Rollback: remove todo from cache on failure
        this.storageService.removeTodo(clientTodoId);
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
