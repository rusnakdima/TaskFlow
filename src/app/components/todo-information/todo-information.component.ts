/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, Input, computed } from "@angular/core";
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
export class TodoInformationComponent extends ItemInfoBaseComponent {
  @Input() override isOwner: boolean = true;
  @Input() override isPrivate: boolean = true;

  @Input() todo!: Todo;

  completedCount = computed(() => this.todo?.completed_tasks_count || 0);
  inProgressCount = computed(
    () => (this.todo?.tasks_count || 0) - (this.todo?.completed_tasks_count || 0)
  );
  failedCount = computed(() => 0);
  skippedCount = computed(() => 0);

  constructor() {
    super();
    this.colorScheme.set(ItemInfoColorScheme.BLUE);
  }

  getCategories(): Category[] {
    return this.todo.categories || [];
  }
}
