import { Injectable, signal, inject } from "@angular/core";
import { Todo } from "@models/todo.model";
import { Task } from "@models/task.model";
import { TemplateService } from "@services/features/template.service";
import { NotifyService } from "@services/notifications/notify.service";
import { DataSyncProvider } from "@providers/data-sync.provider";
import { Observable, forkJoin, of } from "rxjs";
import { switchMap, tap, catchError } from "rxjs/operators";

@Injectable({
  providedIn: "root",
})
export class TodosBlueprintService {
  private templateService = inject(TemplateService);
  private notifyService = inject(NotifyService);
  private dataSyncProvider = inject(DataSyncProvider);

  // Blueprint dialog state
  showBlueprintDialog = signal(false);
  showCreateBlueprintDialog = signal(false);
  blueprintToSave = signal<Todo | null>(null);
  newBlueprintName = signal("");
  newBlueprintDescription = signal("");

  showApplyBlueprintDialog = signal(false);
  blueprintToApply = signal<any | null>(null);
  applyBlueprintTitle = signal("");

  saveAsBlueprint(todo: Todo) {
    this.blueprintToSave.set(todo);
    this.newBlueprintName.set(`${todo.title} Blueprint`);
    this.newBlueprintDescription.set(todo.description || "");
    this.showCreateBlueprintDialog.set(true);
  }

  confirmSaveAsBlueprint(): boolean {
    const todo = this.blueprintToSave();
    const name = this.newBlueprintName();
    const description = this.newBlueprintDescription();

    if (todo && name) {
      this.templateService.createTemplateFromTodo(todo, name, description);
      this.notifyService.showSuccess(`Project saved as "${name}" Blueprint`);
      this.closeCreateBlueprintDialog();
      return true;
    }
    return false;
  }

  closeCreateBlueprintDialog() {
    this.showCreateBlueprintDialog.set(false);
    this.blueprintToSave.set(null);
    this.newBlueprintName.set("");
    this.newBlueprintDescription.set("");
  }

  openApplyBlueprint(template: any) {
    this.blueprintToApply.set(template);
    this.applyBlueprintTitle.set(template.name);
    this.showApplyBlueprintDialog.set(true);
    this.showBlueprintDialog.set(false);
  }

  confirmCreateFromBlueprint(userId: string): Observable<any> {
    const template = this.blueprintToApply();
    const title = this.applyBlueprintTitle();

    if (!template || !title) {
      return of(null);
    }

    const todo: Todo = {
      id: `todo-${Date.now()}`,
      title,
      description: template.description,
      isDeleted: false,
      userId: userId,
      user: { id: userId } as any,
      visibility: "private",
      categories: [],
      tasks: [],
      assignees: [],
      priority: template.priority || "medium",
      order: 0,
      startDate: "",
      endDate: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return this.dataSyncProvider
      .crud<Todo>("create", "todos", { data: todo, isOwner: true, isPrivate: true })
      .pipe(
        switchMap((createdTodo: Todo) => {
          const todoId = createdTodo.id;
          const tasks = this.templateService.applyTemplate(template, todoId, userId);

          if (tasks.length === 0) {
            return of(createdTodo);
          }

          const taskObservables = tasks.map((task: any) => {
            const { subtasks, ...taskWithoutSubtasks } = task;
            return this.dataSyncProvider
              .crud<Task>("create", "tasks", { data: taskWithoutSubtasks, parentTodoId: todoId, isOwner: true, isPrivate: true })
              .pipe(
                switchMap((createdTask: Task) => {
                  const subtasksToCreate = subtasks || [];
                  if (subtasksToCreate.length === 0) {
                    return of(createdTask);
                  }

                  const subtaskObservables = subtasksToCreate.map((subtask: any) => {
                    const subtaskWithActualTaskId = {
                      ...subtask,
                      taskId: createdTask.id,
                      todoId: todoId,
                    };
                    return this.dataSyncProvider.crud<any>("create", "subtasks", { data: subtaskWithActualTaskId, parentTodoId: todoId, isOwner: true, isPrivate: true });
                  });

                  return forkJoin(subtaskObservables);
                })
              );
          });

          return forkJoin(taskObservables).pipe(switchMap(() => of(createdTodo)));
        }),
        tap(() => {
          this.notifyService.showSuccess("Project created from Blueprint!");
          this.showApplyBlueprintDialog.set(false);
        }),
        catchError((err) => {
          this.notifyService.showError(err.message || "Failed to create project");
          throw err;
        })
      );
  }

  removeBlueprint(templateId: string) {
    if (confirm("Are you sure you want to remove this blueprint?")) {
      this.templateService.deleteTemplate(templateId);
      this.notifyService.showSuccess("Blueprint removed successfully");
      return true;
    }
    return false;
  }

  getSubtasksCount(template: any): number {
    return template.tasks.reduce((sum: number, t: any) => sum + (t.subtasks?.length || 0), 0);
  }
}
