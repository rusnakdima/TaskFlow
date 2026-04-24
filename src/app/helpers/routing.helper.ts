import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';

@Injectable({ providedIn: 'root' })
export class RoutingHelper {
  private static router: Router;

  static setRouter(router: Router): void {
    RoutingHelper.router = router;
  }

  static extractTodoId(url?: string): string | null {
    const path = url || this.getCurrentPath();
    const match = path.match(/\/todos\/([^\/]+)/);
    return match?.[1] || null;
  }

  static extractTaskId(url?: string): string | null {
    const path = url || this.getCurrentPath();
    const match = path.match(/\/todos\/([^\/]+)\/tasks\/([^\/]+)/);
    return match?.[2] || null;
  }

  static extractSubtaskId(url?: string): string | null {
    const path = url || this.getCurrentPath();
    const match = path.match(/\/todos\/([^\/]+)\/tasks\/([^\/]+)\/subtasks\/([^\/]+)/);
    return match?.[3] || null;
  }

  static extractCategoryId(url?: string): string | null {
    const path = url || this.getCurrentPath();
    const match = path.match(/\/categories\/([^\/]+)/);
    return match?.[1] || null;
  }

  static getCurrentPath(): string {
    if (this.router) {
      return this.router.url;
    }
    return window?.location?.pathname || '';
  }

  static isOnRoute(pattern: RegExp | string): boolean {
    const path = this.getCurrentPath();
    if (typeof pattern === 'string') {
      return path === pattern || path.startsWith(pattern + '/');
    }
    return pattern.test(path);
  }

  static goToTodo(todoId: string): void {
    this.router.navigate(['/todos', todoId]);
  }

  static goToTask(todoId: string, taskId: string): void {
    this.router.navigate(['/todos', todoId, 'tasks', taskId]);
  }

  static goToSubtask(todoId: string, taskId: string, subtaskId: string): void {
    this.router.navigate(['/todos', todoId, 'tasks', taskId, 'subtasks', subtaskId]);
  }

  static goToCategory(categoryId: string): void {
    this.router.navigate(['/categories', categoryId]);
  }

  static goToDashboard(): void {
    this.router.navigate(['/']);
  }

  static goToSettings(): void {
    this.router.navigate(['/settings']);
  }
}