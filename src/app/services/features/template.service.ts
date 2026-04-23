import { Injectable, signal } from "@angular/core";
import { Todo } from "@models/todo.model";
import { Task } from "@models/task.model";

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  tasks: TemplateTask[];
  categories: string[];
  createdAt: string;
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
      } catch {
        // Silently ignore parse errors
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
      categories: todo.categories?.map((cat) => cat.id) || [],
      createdAt: new Date().toISOString(),
    };

    this.templates.update((templates) => [...templates, template]);
    this.saveTemplates();

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
