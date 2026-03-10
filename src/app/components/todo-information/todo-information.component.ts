/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, Input, signal, inject } from "@angular/core";
import { RouterModule } from "@angular/router";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { Todo } from "@models/todo.model";
import { TaskStatus } from "@models/task.model";

/* services */
import { StorageService } from "@services/storage.service";

/* components */
import { ProgressBarComponent } from "@components/progress-bar/progress-bar.component";

/* helpers */
import { BaseItemHelper } from "@helpers/base-item.helper";

@Component({
  selector: "app-todo-information",
  standalone: true,
  imports: [CommonModule, MatIconModule, RouterModule, ProgressBarComponent],
  templateUrl: "./todo-information.component.html",
})
export class TodoInformationComponent {
  private baseHelper = inject(BaseItemHelper);

  @Input() todo!: Todo;
  @Input() isOwner: boolean = true;
  @Input() isPrivate: boolean = true;

  getCompletedTasksCount(): number {
    return this.baseHelper.countCompleted(this.todo.tasks || []);
  }

  getInProgressTasksCount(): number {
    return (this.todo.tasks || []).filter((task) => task.status === TaskStatus.PENDING).length;
  }
}
