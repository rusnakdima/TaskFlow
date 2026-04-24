import { Injectable, signal } from "@angular/core";

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
export class TemplateStorageService {
  private readonly STORAGE_KEY = "projectTemplates";

  templates = signal<ProjectTemplate[]>([]);

  constructor() {
    this.loadTemplates();
  }

  loadTemplates(): void {
    const stored = localStorage.getItem(this.STORAGE_KEY);
    if (stored) {
      try {
        this.templates.set(JSON.parse(stored));
      } catch {
      }
    }
  }

  saveTemplates(): void {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.templates()));
  }
}