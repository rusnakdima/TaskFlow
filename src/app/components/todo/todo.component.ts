/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, Input } from "@angular/core";
import { RouterModule } from "@angular/router";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* helpers */
import { Common } from "@helpers/common";

/* models */
import { Todo } from "@models/todo";
import { Task } from "@models/task";

/* components */
import { CircleProgressComponent } from "@components/circle-progress/circle-progress.component";

@Component({
  selector: "app-todo",
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, CircleProgressComponent],
  templateUrl: "./todo.component.html",
})
export class TodoComponent {
  constructor() {}

  @Input() todo: Todo | null = null;
  @Input() index: number = 0;

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
}
