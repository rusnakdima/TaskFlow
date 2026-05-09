import { Injectable, inject, signal } from "@angular/core";
import { ProjectTemplate, TemplateService, TemplateTask } from "./template.service";
import { StorageService } from "@services/storage.service";
import { Todo } from "@models/todo.model";
import { Observable, of } from "rxjs";
import { REQUEST_SERVICE, Visibility } from "@services/api.service";

@Injectable({
  providedIn: "root",
})
export class TodosBlueprintService {
  private templateService = inject(TemplateService);
  private storageService = inject(StorageService);
  private requestService = inject(REQUEST_SERVICE);

  showBlueprintDialog = signal(false);
  showCreateBlueprintDialog = signal(false);
  newBlueprintName = signal("");
  newBlueprintDescription = signal("");
  showApplyBlueprintDialog = signal(false);
  applyBlueprintTitle = signal("");
  selectedTemplateForApply = signal<ProjectTemplate | null>(null);

  getTodosFromBlueprint(template: ProjectTemplate, userId: string): Todo[] {
    const todos: Todo[] = [];

    if (template.tasks && template.tasks.length > 0) {
      template.tasks.forEach((taskTemplate: TemplateTask, index: number) => {
        const todo = this.createTodoFromTemplate(taskTemplate, userId);
        todo.order = index;
        todos.push(todo);
      });
    }

    return todos;
  }

  saveAsBlueprint(todo: Todo): void {
    this.newBlueprintName.set(todo.title || "");
    this.newBlueprintDescription.set(todo.description || "");
    this.showCreateBlueprintDialog.set(true);
  }

  confirmSaveAsBlueprint(): void {
    const name = this.newBlueprintName();
    const description = this.newBlueprintDescription();
    if (!name.trim()) return;

    const todos = this.storageService.todos();
    const allTodos: Todo[] = todos;
    const foundTodo = allTodos.find(
      (t) => t.title === name && t.description === (description || "")
    );

    if (foundTodo) {
      this.templateService.createTemplate(name, description || "", foundTodo);
    }

    this.showCreateBlueprintDialog.set(false);
    this.newBlueprintName.set("");
    this.newBlueprintDescription.set("");
  }

  closeCreateBlueprintDialog(): void {
    this.showCreateBlueprintDialog.set(false);
    this.newBlueprintName.set("");
    this.newBlueprintDescription.set("");
  }

  confirmCreateFromBlueprint(userId: string): Observable<Todo[]> {
    const template = this.selectedTemplateForApply();
    const title = this.applyBlueprintTitle();

    if (!template) {
      return of([]);
    }

    const todoData: Partial<Todo> = {
      title: title || template.name,
      description: template.description || "",
      visibility: "private",
      priority: "medium",
      user_id: userId,
    };

    return new Observable((subscriber) => {
      this.requestService
        .create(
          "todos",
          {
            ...todoData,
            visibility: "private",
          },
          { visibility: "private" as Visibility }
        )
        .subscribe({
          next: (createdTodo) => {
            if (createdTodo) {
              const currentTodos = this.storageService.todos();
              this.storageService.setCollection("privateTodos", [...currentTodos, createdTodo]);

              const tasks = this.templateService.applyTemplate(template, createdTodo.id);
              const currentTasks = this.storageService.tasks();
              this.storageService.setCollection("tasks", [...currentTasks, ...tasks], {
                append: true,
              });

              subscriber.next([createdTodo]);
              subscriber.complete();

              this.showApplyBlueprintDialog.set(false);
              this.selectedTemplateForApply.set(null);
              this.applyBlueprintTitle.set("");
            }
          },
          error: (err) => {
            subscriber.error(err);
          },
        });
    });
  }

  openApplyBlueprint(template: ProjectTemplate): void {
    this.selectedTemplateForApply.set(template);
    this.showApplyBlueprintDialog.set(true);
    this.applyBlueprintTitle.set(template.name || "");
  }

  removeBlueprint(templateId: string): void {
    this.templateService.deleteTemplate(templateId);
  }

  getSubtasksCount(template: ProjectTemplate): number {
    return template.tasks?.length || 0;
  }

  private createTodoFromTemplate(template: TemplateTask, userId: string): Todo {
    return {
      id: `todo-${Date.now()}`,
      title: template.title,
      description: template.description || "",
      deleted_at: null,
      user_id: userId,
      user: { id: userId } as any,
      visibility: "private",
      category_ids: [],
      categories: [],
      assignee_ids: [],
      assignees: [],
      assignees_profiles: [] as any[],
      tasks_count: 0,
      completed_tasks_count: 0,
      chats_count: 0,
      priority: template.priority || "medium",
      order: 0,
      start_date: null,
      end_date: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }
}
