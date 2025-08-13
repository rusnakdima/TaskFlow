/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, Input } from "@angular/core";
import { RouterModule } from "@angular/router";

/* helpers */
import { Common } from "@helpers/common";

/* models */
import { Task } from "@models/task";
import { Todo } from "@models/todo";

@Component({
  selector: "app-todo",
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: "./todo.component.html",
})
export class TodoComponent {
  constructor() {}

  @Input() todo: Todo | null = null;

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
    const percent = listCompletedTasks.length / listTasks.length;
    return percent;
  }
}
