/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, Input } from "@angular/core";

/* models */
import { Task } from "@models/task";
import { Subtask } from "@models/subtask";

/* components */
import { CircleProgressComponent } from "@components/circle-progress/circle-progress.component";

@Component({
  selector: "app-task-information",
  standalone: true,
  imports: [CommonModule, CircleProgressComponent],
  templateUrl: "./task-information.component.html",
})
export class TaskInformationComponent {
  constructor() {}

  @Input() task!: Task;

  get percentCompletedSubTasks(): number {
    const listSubtasks = this.task?.subtasks ?? [];
    const listCompletedSubtasks = listSubtasks.filter((subtask: Subtask) => subtask.isCompleted);
    const percent =
      listCompletedSubtasks.length / (listSubtasks.length == 0 ? 1 : listSubtasks.length);
    return percent;
  }
}
