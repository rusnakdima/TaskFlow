import { Injectable, inject } from "@angular/core";
import { ProjectTemplate, TemplateService } from "./template.service";
import { StorageService } from "@services/core/storage.service";
import { Todo } from "@models/todo.model";

@Injectable({
  providedIn: "root",
})
export class TodosBlueprintService {
  private templateService = inject(TemplateService);
  private storageService = inject(StorageService);

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

  private createTodoFromTemplate(template: any, userId: string): Todo {
    return {
      id: `todo-${Date.now()}`,
      title: template.title,
      description: template.description,
      deleted_at: null,
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
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }
}
