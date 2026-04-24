import { Injectable } from "@angular/core";

@Injectable({
  providedIn: "root",
})
export class AdminDataTransformationService {
  transformUsers(users: any[]): { id: string; label: string }[] {
    return users
      .map((u: any) => ({ id: u.id, label: u.username || u.email }))
      .sort((a: any, b: any) => a.label.localeCompare(b.label));
  }

  transformCategories(categories: any[]): { id: string; label: string }[] {
    return categories
      .map((c: any) => ({ id: c.id, label: c.title }))
      .sort((a: any, b: any) => a.label.localeCompare(b.label));
  }

  transformTodos(todos: any[]): { id: string; label: string }[] {
    return todos
      .filter((t: any) => !t.deleted_at)
      .map((t: any) => ({ id: t.id, label: t.title || t.id }))
      .sort((a: any, b: any) => a.label.localeCompare(b.label));
  }

  transformTasks(tasks: any[]): { id: string; label: string }[] {
    return tasks
      .filter((t: any) => !t.deleted_at)
      .map((t: any) => ({ id: t.id, label: t.title || t.id }))
      .sort((a: any, b: any) => (a.label || "").localeCompare(b.label || ""));
  }

  transformSubtasks(subtasks: any[]): { id: string; label: string }[] {
    return subtasks
      .filter((s: any) => !s.deleted_at)
      .map((s: any) => ({ id: s.id, label: s.description || s.id }))
      .sort((a: any, b: any) => (a.label || "").localeCompare(b.label || ""));
  }
}
