/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, Input } from "@angular/core";
import { RouterModule } from "@angular/router";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* helpers */
import { Common } from "@helpers/common";

/* models */
import { Task } from "@models/task";
import { Subtask } from "@models/subtask";

/* components */
import { CircleProgressComponent } from "@components/circle-progress/circle-progress.component";

@Component({
  selector: "app-task",
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, CircleProgressComponent],
  templateUrl: "./task.component.html",
})
export class TaskComponent {
  constructor() {}

  @Input() task: Task | null = null;
  @Input() index: number = 0;

  truncateString = Common.truncateString;

  get countCompletedTasks(): number {
    const listSubtasks = this.task?.subtasks ?? [];
    const listCompletedSubtasks = listSubtasks.filter((subtask: Subtask) => subtask.isCompleted);
    return listCompletedSubtasks.length;
  }

  get countTasks(): number {
    const listSubtasks = this.task?.subtasks ?? [];
    return listSubtasks.length;
  }

  get percentCompletedTasks(): number {
    const listSubtasks = this.task?.subtasks ?? [];
    const listCompletedSubtasks = listSubtasks.filter((subtask: Subtask) => subtask.isCompleted);
    const percent =
      listCompletedSubtasks.length / (listSubtasks.length == 0 ? 1 : listSubtasks.length);
    return percent;
  }
}
