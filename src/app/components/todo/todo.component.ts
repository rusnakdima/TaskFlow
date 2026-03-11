/* sys lib */
import { CommonModule } from "@angular/common";
import {
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
  ViewChild,
  signal,
  inject,
} from "@angular/core";
import { RouterModule } from "@angular/router";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { DragDropModule } from "@angular/cdk/drag-drop";

/* components */
import { ShortcutHelpComponent } from "@components/shortcut-help/shortcut-help.component";
import { ProgressBarComponent } from "@components/progress-bar/progress-bar.component";

/* helpers */
import { Common } from "@helpers/common.helper";
import { BaseItemHelper } from "@helpers/base-item.helper";

/* services */
import { AuthService } from "@services/auth.service";
import { NotifyService } from "@services/notify.service";
import { TemplateService } from "@services/template.service";

/* models */
import { Todo } from "@models/todo.model";
import { TaskStatus } from "@models/task.model";

import { ChangeDetectionStrategy, ChangeDetectorRef } from "@angular/core";

@Component({
  selector: "app-todo",
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, DragDropModule, ProgressBarComponent],
  templateUrl: "./todo.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TodoComponent implements OnInit {
  private baseHelper = inject(BaseItemHelper);
  private authService = inject(AuthService);
  private notifyService = inject(NotifyService);
  private templateService = inject(TemplateService);

  @Input() todo: Todo | null = null;
  @Input() index: number = 0;
  @Input() isOwner: boolean = true;
  @Input() isPrivate: boolean = true;
  @Input() highlight: boolean = false;
  @Input() unreadCommentsCount: number = 0;

  @Output() deleteTodoEvent: EventEmitter<string> = new EventEmitter();
  @Output() saveAsBlueprintEvent: EventEmitter<Todo> = new EventEmitter();

  isExpandedDetails = signal(false);

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit() {}

  truncateString = Common.truncateString;

  toggleDetails(event: any) {
    event.stopPropagation();
    this.isExpandedDetails.update((v) => !v);
    this.cdr.markForCheck();
  }

  getAssigneeImageUrl(assignee: any): string {
    return assignee?.user?.profile?.imageUrl || "assets/images/user.png";
  }

  getAssigneeUserId(assignee: any): string {
    return assignee?.userId || "";
  }

  getProjectStatusColor(): string {
    if (!this.todo || !this.todo.tasks || this.todo.tasks.length === 0) {
      return "bg-gray-400";
    }

    const completed = this.baseHelper.countCompleted(this.todo.tasks);
    if (completed === this.todo.tasks.length) {
      return "bg-green-500";
    }
    return "bg-blue-500";
  }

  getProjectStatusText(): string {
    if (!this.todo || !this.todo.tasks || this.todo.tasks.length === 0) {
      return "No tasks";
    }
    const completed = this.baseHelper.countCompleted(this.todo.tasks);
    if (completed === this.todo.tasks.length) {
      return "Completed";
    }
    return "In Progress";
  }

  getPriorityBadgeClass = this.baseHelper.getPriorityBadgeClass;

  formatDate = this.baseHelper.formatDate;

  deleteTodo() {
    if (this.todo) {
      this.deleteTodoEvent.emit(this.todo.id);
    }
  }

  onSaveAsBlueprint(event: any) {
    event.stopPropagation();
    if (this.todo) {
      this.saveAsBlueprintEvent.emit(this.todo);
    }
  }

  get countTasks(): number {
    return this.todo?.tasks?.length ?? 0;
  }
}
