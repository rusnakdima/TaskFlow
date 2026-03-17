/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output, inject } from "@angular/core";
import { FormsModule } from "@angular/forms";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
import { MatTooltipModule } from "@angular/material/tooltip";

/* services */
import { BulkActionService } from "@services/bulk-action.service";

/**
 * BulkActionsComponent - Displays a floating bar when items are selected.
 * Accepts selection state as inputs and emits action events to the parent view.
 */
@Component({
  selector: "app-bulk-actions",
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatButtonModule, MatTooltipModule],
  templateUrl: "./bulk-actions.component.html",
})
export class BulkActionsComponent {
  public bulkActionService = inject(BulkActionService);

  @Input() selectedCount: number = 0;
  @Input() isAllSelected: boolean = false;
  @Input() mode: string = "";

  @Output() selectAllEvent = new EventEmitter<void>();
  @Output() setStatusEvent = new EventEmitter<string>();
  @Output() softDeleteEvent = new EventEmitter<void>();
  @Output() hardDeleteEvent = new EventEmitter<void>();
  @Output() cancelEvent = new EventEmitter<void>();

  get showBulkActions(): boolean {
    return this.selectedCount > 0;
  }

  onSelectAll(): void {
    this.selectAllEvent.emit();
  }

  onSetStatus(status: string): void {
    this.setStatusEvent.emit(status);
  }

  onSoftDelete(): void {
    this.softDeleteEvent.emit();
  }

  onHardDelete(): void {
    this.hardDeleteEvent.emit();
  }

  onCancel(): void {
    this.cancelEvent.emit();
  }
}
