import { Injectable, inject, signal } from "@angular/core";
import { ProjectTemplate, TemplateService } from "./template.service";
import { StorageService } from "@services/core/storage.service";
import { Todo } from "@models/todo.model";
import { Observable } from "rxjs";

@Injectable({
  providedIn: "root",
})
export class TodosBlueprintService {
  private templateService = inject(TemplateService);
  private storageService = inject(StorageService);

  showBlueprintDialog = signal(false);
  showCreateBlueprintDialog = signal(false);
  newBlueprintName = signal("");
  newBlueprintDescription = signal("");
  showApplyBlueprintDialog = signal(false);
  applyBlueprintTitle = signal("");

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
    // TODO: Implement save as blueprint
  }

  confirmSaveAsBlueprint(): void {
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
    return new Observable((subscriber) => {
      subscriber.next([]);
      subscriber.complete();
    });
  }

  openApplyBlueprint(template: ProjectTemplate): void {
    this.showApplyBlueprintDialog.set(true);
    this.applyBlueprintTitle.set(template.name || "");
  }

  removeBlueprint(templateId: string): void {
    // Blueprint removal not yet implemented
  }

  getSubtasksCount(template: ProjectTemplate): number {
    return template.tasks?.length || 0;
  }

  private createTodoFromTemplate(template: any, userId: string): Todo {
    return {
      id: `todo-${Date.now()}`,
      title: template.title,
      description: template.description,
      deletedAt: null,
      userId: userId,
      user: { id: userId } as any,
      visibility: "private",
      categories: [],
      tasks: [],
      assignees: [],
      assigneesProfiles: [],
      priority: template.priority || "medium",
      order: 0,
      startDate: null,
      endDate: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
}
