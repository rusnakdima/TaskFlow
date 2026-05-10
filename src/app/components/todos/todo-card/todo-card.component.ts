import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  signal,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { MatMenuModule } from "@angular/material/menu";
import { DragDropModule, CdkDragDrop } from "@angular/cdk/drag-drop";

import { ItemDisplayAction } from "@models/item-display.model";
import { Todo } from "@models/todo.model";
import { ItemType } from "@models/base.model";
import { getActionColor } from "@helpers/action-color.helper";

@Component({
  selector: "app-todo-card",
  standalone: true,
  imports: [CommonModule, MatIconModule, MatMenuModule, DragDropModule],
  templateUrl: "./todo-card.component.html",
  styleUrl: "./todo-card.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TodoCardComponent {
  @Input() todo: Todo | null = null;
  @Input() isExpanded = false;
  @Input() actions: ItemDisplayAction[] = [];
  @Input() itemType: ItemType = "todo";
  @Input() isOwner = true;
  @Input() isPrivate = true;

  @Output() toggleExpand = new EventEmitter<Todo>();
  @Output() dropped = new EventEmitter<CdkDragDrop<Todo[]>>();
  @Output() todoAction = new EventEmitter<{ action: string; todo: Todo }>();

  showMenu = signal(false);

  get todoId(): string {
    return this.todo?.id || "";
  }

  get taskStatus(): string {
    if (!this.todo) return "Pending";
    const tasksCount = this.todo.tasks_count || 0;
    const completedCount = this.todo.completed_tasks_count || 0;

    if (tasksCount === 0) return "Pending";
    if (completedCount === tasksCount) return "Completed";
    if (completedCount > 0) return "In Progress";
    return "Pending";
  }

  get taskStatusColor(): string {
    const status = this.taskStatus;
    switch (status) {
      case "Completed":
        return "bg-green-500";
      case "In Progress":
        return "bg-blue-500";
      default:
        return "bg-yellow-500";
    }
  }

  get hasDescription(): boolean {
    return !!this.todo?.description;
  }

  get hasEndDate(): boolean {
    return !!this.todo?.end_date;
  }

  get formattedStartDate(): string | null {
    if (!this.todo?.start_date) return null;
    const date = new Date(this.todo.start_date);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  get formattedEndDate(): string | null {
    if (!this.todo?.end_date) return null;
    const date = new Date(this.todo.end_date);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  get isOverdue(): boolean {
    if (!this.todo?.end_date) return false;
    return new Date(this.todo.end_date) < new Date();
  }

  get priorityBadge(): string {
    const priority = this.todo?.priority?.toLowerCase();
    switch (priority) {
      case "high":
        return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
      case "medium":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
      case "low":
        return "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300";
      default:
        return "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300";
    }
  }

  get visibilityLabel(): string {
    const visibility = this.todo?.visibility?.toLowerCase();
    switch (visibility) {
      case "private":
        return "Private";
      case "shared":
        return "Shared";
      case "public":
        return "Public";
      default:
        return visibility || "Private";
    }
  }

  get visibilityBadge(): string {
    const visibility = this.todo?.visibility?.toLowerCase();
    switch (visibility) {
      case "private":
        return "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300";
      case "shared":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
      case "public":
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
      default:
        return "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300";
    }
  }

  get hasCategories(): boolean {
    return !!this.todo?.categories?.length;
  }

  get categoriesToShow() {
    return this.todo?.categories?.slice(0, 3) || [];
  }

  get remainingCategoriesCount(): number {
    const total = this.todo?.categories?.length || 0;
    return total > 3 ? total - 3 : 0;
  }

  get formattedCreatedAt(): string | null {
    if (!this.todo?.created_at) return null;
    const date = new Date(this.todo.created_at);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  get formattedUpdatedAt(): string | null {
    if (!this.todo?.updated_at) return null;
    const date = new Date(this.todo.updated_at);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  toggleExpandCard(event: MouseEvent): void {
    event.stopPropagation();
    if (this.todo) {
      this.toggleExpand.emit(this.todo);
    }
  }

  toggleMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.showMenu.update((v) => !v);
  }

  onAction(action: string): void {
    event?.stopPropagation();
    if (this.todo) {
      this.todoAction.emit({ action, todo: this.todo });
    }
    this.showMenu.set(false);
  }

  onDragDrop(event: CdkDragDrop<Todo[]>): void {
    this.dropped.emit(event);
  }

  getActionColor(action: string): string {
    return getActionColor(action, "rounded p-1.5 transition-colors");
  }
}
