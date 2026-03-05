/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output } from "@angular/core";
import { FormsModule } from "@angular/forms";

/* materials */
import { MatIconModule } from "@angular/material/icon";

@Component({
  selector: "app-bulk-actions",
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: "./bulk-actions.component.html",
})
export class BulkActionsComponent {
  constructor() {}

  @Input() selectedCount: number = 0;
  @Input() isAllSelected: boolean = false;
  @Output() selectAllEvent: EventEmitter<void> = new EventEmitter<void>();
  @Output() bulkPriorityEvent: EventEmitter<string> = new EventEmitter<string>();
  @Output() bulkStatusEvent: EventEmitter<string> = new EventEmitter<string>();
  @Output() bulkDeleteEvent: EventEmitter<void> = new EventEmitter<void>();
  @Output() cancelEvent: EventEmitter<void> = new EventEmitter<void>();

  onSelectAll(): void {
    this.selectAllEvent.emit();
  }

  onPriorityChange(priority: string): void {
    this.bulkPriorityEvent.emit(priority);
  }

  onStatusChange(): void {
    this.bulkStatusEvent.emit("completed");
  }

  onDelete(): void {
    this.bulkDeleteEvent.emit();
  }

  onCancel(): void {
    this.cancelEvent.emit();
  }
}
