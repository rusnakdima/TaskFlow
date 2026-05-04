/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, Input, OnChanges, SimpleChanges } from "@angular/core";
import { RouterModule } from "@angular/router";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { Todo } from "@models/todo.model";
import { Category } from "@models/category.model";

/* components */
import {
  ItemInfoBaseComponent,
  ItemInfoColorScheme,
} from "@components/item-info-base/item-info-base.component";
import { ProgressBarComponent } from "@components/progress-bar/progress-bar.component";

@Component({
  selector: "app-todo-information",
  standalone: true,
  imports: [CommonModule, MatIconModule, RouterModule, ProgressBarComponent],
  templateUrl: "./todo-information.component.html",
})
export class TodoInformationComponent extends ItemInfoBaseComponent implements OnChanges {
  @Input() override isOwner: boolean = true;
  @Input() override isPrivate: boolean = true;

  @Input() todo!: Todo;

  constructor() {
    super();
    this.colorScheme.set(ItemInfoColorScheme.BLUE);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["todo"] && this.todo) {
      this._completed.set(this.todo.completed_tasks_count || 0);
      this._skipped.set(0);
      this._failed.set(0);
      this._inProgress.set((this.todo.tasks_count || 0) - (this.todo.completed_tasks_count || 0));
    }
  }

  getCategories(): Category[] {
    return this.todo.categories || [];
  }
}
