import { Injectable, inject } from "@angular/core";
import { Todo } from "@models/todo.model";
import { TemplateStorageService, ProjectTemplate, TemplateTask } from "./template-storage.service";

@Injectable({
  providedIn: "root",
})
export class TemplateFactoryService {
  private storage = inject(TemplateStorageService);

  createTemplate(name: string, description: string, todo: Todo): ProjectTemplate {
    const templateTasks: TemplateTask[] =
      todo.tasks?.map((task) => ({
        title: task.title,
        description: task.description,
        priority: task.priority,
        subtasks:
          task.subtasks?.map((st) => ({
            title: st.title,
          })) || [],
      })) || [];

    const template: ProjectTemplate = {
      id: Date.now().toString(),
      name,
      description,
      tasks: templateTasks,
      categories: todo.categories?.map((cat) => cat.id) || [],
      createdAt: new Date().toISOString(),
    };

    this.storage.templates.update((templates) => [...templates, template]);
    this.storage.saveTemplates();

    return template;
  }

  applyTemplate(template: ProjectTemplate, userId: string, todo_id?: string): any[] {
    return template.tasks.map((templateTask, index) => ({
      id: `${todo_id}-task-${Date.now()}-${index}`,
      todo_id,
      title: templateTask.title,
      description: templateTask.description,
      subtasks: templateTask.subtasks.map((st, stIndex) => ({
        id: `${todo_id}-task-${Date.now()}-${index}-subtask-${stIndex}`,
        task_id: `${todo_id}-task-${Date.now()}-${index}`,
        title: st.title,
        description: "",
        status: "pending",
        priority: templateTask.priority,
        isCompleted: false,
        deleted_at: null,
        order: stIndex,
        start_date: null,
        end_date: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })),
      status: "pending",
      priority: templateTask.priority,
      start_date: null,
      end_date: null,
      order: index,
      deleted_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      assignees: [],
      dependsOn: [],
    }));
  }

  deleteTemplate(templateId: string): void {
    this.storage.templates.update((templates) => templates.filter((t) => t.id !== templateId));
    this.storage.saveTemplates();
  }

  getTemplate(templateId: string): ProjectTemplate | undefined {
    return this.storage.templates().find((t) => t.id === templateId);
  }

  getTemplates(): ProjectTemplate[] {
    return this.storage.templates();
  }

  getTemplateTasks(templateId: string): TemplateTask[] {
    const template = this.getTemplate(templateId);
    return template?.tasks || [];
  }
}
