/* sys lib */
import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";

/* materials */
import { MatIconModule } from "@angular/material/icon";

@Component({
  selector: "app-comments-toggle",
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: "./comments-toggle.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommentsToggleComponent {
  @Input() showComments: boolean = false;
  @Input() unreadCount: number = 0;
  @Input() count: number = 0;
  @Output() toggle = new EventEmitter<void>();

  get buttonClasses(): string {
    return this.showComments
      ? "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400"
      : "text-purple-600 hover:bg-purple-50 dark:text-purple-400 dark:hover:bg-purple-900/30";
  }

  onClick(event: Event): void {
    event.stopPropagation();
    this.toggle.emit();
  }
}
