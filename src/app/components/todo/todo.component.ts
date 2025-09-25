/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output } from "@angular/core";
import { RouterModule } from "@angular/router";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* helpers */
import { Common } from "@helpers/common.helper";

/* models */
import { Todo } from "@models/todo";
import { Task } from "@models/task";

@Component({
  selector: "app-todo",
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule],
  templateUrl: "./todo.component.html",
})
export class TodoComponent {
  constructor() {}

  @Input() todo: Todo | null = null;
  @Input() index: number = 0;
  @Output() deleteEvent: EventEmitter<string> = new EventEmitter<string>();

  truncateString = Common.truncateString;

  get countCompletedTasks(): number {
    const listTasks = this.todo?.tasks ?? [];
    const listCompletedTasks = listTasks.filter((task: Task) => task.isCompleted);
    return listCompletedTasks.length;
  }

  get countTasks(): number {
    const listTasks = this.todo?.tasks ?? [];
    return listTasks.length;
  }

  get percentCompletedTasks(): number {
    const listTasks = this.todo?.tasks ?? [];
    const listCompletedTasks = listTasks.filter((task: Task) => task.isCompleted);
    const percent = listCompletedTasks.length / (listTasks.length == 0 ? 1 : listTasks.length);
    return percent;
  }

  getProgressPercentage(): number {
    return Math.round(this.percentCompletedTasks * 100);
  }

  getProgressColor(): string {
    const progress = this.getProgressPercentage();
    if (progress >= 100) return "bg-green-500";
    if (progress >= 75) return "bg-blue-500";
    if (progress >= 50) return "bg-yellow-500";
    if (progress >= 25) return "bg-orange-500";
    return "bg-red-500";
  }

  getProjectStatusColor(): string {
    const progress = this.getProgressPercentage();
    if (progress >= 100) return "bg-green-500";
    if (progress >= 50) return "bg-blue-500";
    return "bg-orange-500";
  }

  getProjectStatusText(): string {
    const progress = this.getProgressPercentage();
    if (progress >= 100) return "Completed";
    if (progress >= 50) return "In Progress";
    return "Just Started";
  }

  getPriorityColor(): string {
    if (this.isOverdue()) {
      return "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300";
    }
    if (this.isDueSoon()) {
      return "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300";
    }
    return "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300";
  }

  getPriorityText(): string {
    if (this.isOverdue()) return "Overdue";
    if (this.isDueSoon()) return "Due Soon";
    return "On Track";
  }

  formatDate(dateString: string): string {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }

  getMemberInitials(email: string): string {
    if (!email) return "U";
    return email.split("@")[0].substring(0, 2).toUpperCase();
  }

  isOverdue(): boolean {
    if (!this.todo?.endDate) return false;
    const now = new Date();
    const deadline = new Date(this.todo.endDate);
    return deadline < now && this.getProgressPercentage() < 100;
  }

  isDueSoon(): boolean {
    if (!this.todo?.endDate) return false;
    const now = new Date();
    const deadline = new Date(this.todo.endDate);
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(now.getDate() + 3);
    return deadline <= threeDaysFromNow && deadline > now;
  }

  deleteProject(event: Event) {
    event.stopPropagation();
    if (confirm(`Are you sure you want to delete "${this.todo?.title}"?`)) {
      this.deleteEvent.emit(this.todo?.id || "");
    }
  }
}
