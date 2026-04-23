import { Injectable, inject, signal } from "@angular/core";
import { ProjectTemplate, TemplateService } from "./template.service";
import { StorageService } from "@services/core/storage.service";
import { ApiProvider } from "@providers/api.provider";
import { Todo } from "@models/todo.model";
import { Observable, of } from "rxjs";

@Injectable({
  providedIn: "root",
})
export class TodosBlueprintService {
  private templateService = inject(TemplateService);
  private storageService = inject(StorageService);
  private apiProvider = inject(ApiProvider);

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
      template.tasks.forEach((taskTemplate, index) => {
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
    const privateTodos = this.storageService.privateTodos();
    const allTodos = [...todos, ...privateTodos];
    const todo = allTodos.find((t) => t.title === name && t.description === (description || ""));

    if (todo) {
      this.templateService.createTemplate(name, description || "", todo);
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
      this.apiProvider
        .crud<Todo>("create", "todos", {
          data: todoData,
          isOwner: true,
          isPrivate: true,
        })
        .subscribe({
          next: (createdTodo) => {
            if (createdTodo) {
              this.storageService.addItem("todos", createdTodo);

              const tasks = this.templateService.applyTemplate(template, userId, createdTodo.id);
              tasks.forEach((task) => {
                this.storageService.addItem("tasks", task);
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

  private createTodoFromTemplate(template: any, userId: string): Todo {
    return {
      id: `todo-${Date.now()}`,
      title: template.title,
      description: template.description,
      deleted_at: null,
      user_id: userId,
      user: { id: userId } as any,
      visibility: "private",
      categories: [],
      tasks: [],
      assignees: [],
      assignees_profiles: [],
      priority: template.priority || "medium",
      order: 0,
      start_date: null,
      end_date: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }
}
