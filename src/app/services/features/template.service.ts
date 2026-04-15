import { Injectable, signal } from "@angular/core";
import { Todo } from "@models/todo.model";
import { Task } from "@models/task.model";

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  tasks: TemplateTask[];
  categories: string[];
  created_at: string;
}

export interface TemplateTask {
  title: string;
  description: string;
  priority: string;
  subtasks: { title: string }[];
}

@Injectable({
  providedIn: "root",
})
export class TemplateService {
  private readonly STORAGE_KEY = "projectTemplates";

  templates = signal<ProjectTemplate[]>([]);

  constructor() {
    this.loadTemplates();
  }

  private loadTemplates(): void {
    const stored = localStorage.getItem(this.STORAGE_KEY);
    if (stored) {
      try {
        this.templates.set(JSON.parse(stored));
      } catch (e) {
        console.error("Failed to load templates", e);
      }
    }
  }

  private saveTemplates(): void {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.templates()));
  }

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
      categories: todo.categories.map((cat) => cat.id),
      created_at: new Date().toISOString(),
    };

    this.templates.update((templates) => [...templates, template]);
    this.saveTemplates();

    return template;
  }

  applyTemplate(template: ProjectTemplate, todoId: string, userId: string): any[] {
    return template.tasks.map((templateTask, index) => ({
      id: `${todoId}-task-${Date.now()}-${index}`,
      todoId,
      title: templateTask.title,
      description: templateTask.description,
      subtasks: templateTask.subtasks.map((st, stIndex) => ({
        id: `${todoId}-task-${Date.now()}-${index}-subtask-${stIndex}`,
        taskId: `${todoId}-task-${Date.now()}-${index}`,
        title: st.title,
        description: "",
        status: "pending",
        priority: templateTask.priority,
        isCompleted: false,
        deleted_at: null,
        order: stIndex,
        startDate: null,
        endDate: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })),
      status: "pending",
      priority: templateTask.priority,
      startDate: null,
      endDate: null,
      order: index,
      deleted_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      assignees: [],
      dependsOn: [],
    }));
  }

  deleteTemplate(templateId: string): void {
    this.templates.update((templates) => templates.filter((t) => t.id !== templateId));
    this.saveTemplates();
  }

  getTemplate(templateId: string): ProjectTemplate | undefined {
    return this.templates().find((t) => t.id === templateId);
  }

  getTemplates(): ProjectTemplate[] {
    return this.templates();
  }

  getTemplateTasks(templateId: string): TemplateTask[] {
    const template = this.getTemplate(templateId);
    return template?.tasks || [];
  }
}
