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
    return BaseItemHelper.countCompleted(this.todo.tasks || []);
  }

  getSkippedTasksCount(): number {
    return (this.todo.tasks || []).filter((task) => task.status === TaskStatus.SKIPPED).length;
  }

  getFailedTasksCount(): number {
    return (this.todo.tasks || []).filter((task) => task.status === TaskStatus.FAILED).length;
  }

  getInProgressTasksCount(): number {
    return (this.todo.tasks || []).filter((task) => task.status === TaskStatus.PENDING).length;
  }

  getCategories(): Category[] {
    return this.todo.categories || [];
  }
}
