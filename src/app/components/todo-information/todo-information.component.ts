/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, Input } from "@angular/core";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { Todo } from "@models/todo";
import { Task } from "@models/task";

/* components */
import { CircleProgressComponent } from "@components/circle-progress/circle-progress.component";

@Component({
  selector: "app-todo-information",
  standalone: true,
  imports: [CommonModule, MatIconModule, CircleProgressComponent],
  templateUrl: "./todo-information.component.html",
})
export class TodoInformationComponent {
  constructor() {}

  @Input() todo!: Todo;

  get percentCompletedTasks(): number {
    const listTasks = this.todo?.tasks ?? [];
    const listCompletedTasks = listTasks.filter((task: Task) => task.isCompleted);
    const percent = listCompletedTasks.length / (listTasks.length == 0 ? 1 : listTasks.length);
    return percent;
  }
}
