/**
 * Track by functions for *ngFor optimization
 */
export function trackById<T extends { id: string }>(index: number, item: T): string {
  return item.id;
}

export function trackByTodoId(index: number, todo: { id: string }): string {
  return todo.id;
}

export function trackByTaskId(index: number, task: { id: string }): string {
  return task.id;
}

export function trackBySubtaskId(index: number, subtask: { id: string }): string {
  return subtask.id;
}

export function trackByCategoryId(index: number, category: { id: string }): string {
  return category.id;
}

export function trackByProfileId(index: number, profile: { id: string }): string {
  return profile.id;
}

export function trackByUserId(index: number, user: { id: string }): string {
  return user.id;
}
