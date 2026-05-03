/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, Input, signal, inject } from "@angular/core";
import { RouterModule } from "@angular/router";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { Todo } from "@models/todo.model";
import { TaskStatus } from "@models/task.model";
import { Category } from "@models/category.model";

/* components */
import { ProgressBarComponent } from "@components/progress-bar/progress-bar.component";

/* helpers */
import { BaseItemHelper } from "@helpers/base-item.helper";
import { DateHelper } from "@helpers/date.helper";

@Component({
  selector: "app-todo-information",
  standalone: true,
  imports: [CommonModule, MatIconModule, RouterModule, ProgressBarComponent],
  templateUrl: "./todo-information.component.html",
})
export class TodoInformationComponent {
  @Input() todo!: Todo;
  @Input() isOwner: boolean = true;
  @Input() isPrivate: boolean = true;

  protected formatDate = DateHelper.formatDateShort;

  getCompletedTasksCount(): number {
    return this.todo.completed_tasks_count || 0;
  }

  getSkippedTasksCount(): number {
    // Cannot get skipped count without accessing nested tasks - return 0 or query storage
    return 0;
  }

  getFailedTasksCount(): number {
    return 0;
  }

  getInProgressTasksCount(): number {
    return (this.todo.tasks_count || 0) - (this.todo.completed_tasks_count || 0);
  }

  getCategories(): Category[] {
    return this.todo.categories || [];
  }
}
