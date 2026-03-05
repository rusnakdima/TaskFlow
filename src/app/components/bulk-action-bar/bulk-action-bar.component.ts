/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
import { MatMenuModule } from "@angular/material/menu";
import { MatChipsModule } from "@angular/material/chips";

/**
 * Bulk action configuration
 */
export interface BulkAction {
  id: string;
  label: string;
  icon: string;
  color?: "default" | "primary" | "warn";
  requiresConfirmation?: boolean;
}

@Component({
  selector: "app-bulk-action-bar",
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule, MatMenuModule, MatChipsModule],
  templateUrl: "./bulk-action-bar.component.html",
})
export class BulkActionBarComponent<T> {
  @Input() selectedCount: number = 0;
  @Input() actions: BulkAction[] = [];
  @Input() entityType: string = "items";

  @Output() action = new EventEmitter<string>();
  @Output() cancel = new EventEmitter<void>();

  get showBar(): boolean {
    return this.selectedCount > 0;
  }

  onAction(actionId: string) {
    this.action.emit(actionId);
  }

  onCancel() {
    this.cancel.emit();
  }
}
