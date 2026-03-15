/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output, inject } from "@angular/core";
import { FormsModule } from "@angular/forms";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
import { MatTooltipModule } from "@angular/material/tooltip";

/* services */
import { BulkActionService, BulkActionMode } from "@services/bulk-action.service";

@Component({
  selector: "app-bulk-actions",
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatButtonModule, MatTooltipModule],
  templateUrl: "./bulk-actions.component.html",
})
export class BulkActionsComponent {
  private bulkActionService = inject(BulkActionService);

  // Inputs for backward compatibility (will be deprecated)
  @Input() selectedCount: number = 0;
  @Input() isAllSelected: boolean = false;
  @Input() mode: BulkActionMode = "todos";

  @Output() selectAllEvent: EventEmitter<void> = new EventEmitter<void>();
  @Output() softDeleteEvent: EventEmitter<void> = new EventEmitter<void>();
  @Output() hardDeleteEvent: EventEmitter<void> = new EventEmitter<void>();
  @Output() setStatusEvent: EventEmitter<string> = new EventEmitter<string>();
  @Output() cancelEvent: EventEmitter<void> = new EventEmitter<void>();
  @Output() bulkPriorityEvent: EventEmitter<string> = new EventEmitter<string>();
  @Output() bulkStatusEvent: EventEmitter<string> = new EventEmitter<string>();
  @Output() bulkDeleteEvent: EventEmitter<void> = new EventEmitter<void>();

  // For views with local selection (todos, tasks, subtasks, admin, archive), use input values
  // For views using service state, use service values
  get selectedCountValue(): number {
    // If mode uses local selection, use input
    if (
      this.mode === "todos" ||
      this.mode === "tasks" ||
      this.mode === "subtasks" ||
      this.mode === "admin" ||
      this.mode === "archive"
    ) {
      return this.selectedCount;
    }
    // Otherwise use service state
    return this.bulkActionService.selectedCount();
  }

  get isAllSelectedValue(): boolean {
    if (
      this.mode === "todos" ||
      this.mode === "tasks" ||
      this.mode === "subtasks" ||
      this.mode === "admin" ||
      this.mode === "archive"
    ) {
      return this.isAllSelected;
    }
    return this.bulkActionService.isAllSelected();
  }

  get modeValue(): BulkActionMode {
    // For local selection views, use input mode
    if (
      this.mode === "todos" ||
      this.mode === "tasks" ||
      this.mode === "subtasks" ||
      this.mode === "admin" ||
      this.mode === "archive"
    ) {
      return this.mode;
    }
    // Otherwise use service mode
    return this.bulkActionService.mode() || this.mode;
  }

  get showBulkActions(): boolean {
    return this.selectedCountValue > 0;
  }

  onSelectAll(): void {
    // For local selection views, just emit event - view handles toggle
    if (
      this.mode === "todos" ||
      this.mode === "tasks" ||
      this.mode === "subtasks" ||
      this.mode === "admin" ||
      this.mode === "archive"
    ) {
      this.selectAllEvent.emit();
    } else {
      // For service-based views, use service
      this.bulkActionService.toggleSelectAll();
      this.selectAllEvent.emit();
    }
  }

  onSoftDelete(): void {
    this.softDeleteEvent.emit();
  }

  onHardDelete(): void {
    this.hardDeleteEvent.emit();
  }

  onSetStatus(status: string): void {
    this.setStatusEvent.emit(status);
  }

  onCancel(): void {
    // For local selection views, just emit event - view handles clearing
    if (
      this.mode === "todos" ||
      this.mode === "tasks" ||
      this.mode === "subtasks" ||
      this.mode === "admin" ||
      this.mode === "archive"
    ) {
      this.cancelEvent.emit();
    } else {
      // For service-based views, clear service state
      this.bulkActionService.clearSelection();
      this.cancelEvent.emit();
    }
  }
}
