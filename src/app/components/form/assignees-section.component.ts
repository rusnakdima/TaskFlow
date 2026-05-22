import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { FormsModule } from "@angular/forms";
import { Profile } from "@models/generated/api.types";
import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";

@Component({
  selector: "app-assignees-section",
  standalone: true,
  imports: [CommonModule, MatIconModule, FormsModule, CheckboxComponent],
  templateUrl: "./assignees-section.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssigneesSectionComponent {
  @Input() assignees: Profile[] = [];
  @Input() selectedIds: Set<string> = new Set();
  @Input() searchQuery = "";
  @Input() disabled = false;
  @Output() searchQueryChange = new EventEmitter<string>();
  @Output() toggleSelection = new EventEmitter<string>();
  @Output() toggleSelectAll = new EventEmitter<void>();

  get filteredAssignees(): Profile[] {
    if (!this.searchQuery) return this.assignees;
    const query = this.searchQuery.toLowerCase();
    return this.assignees.filter(
      (p) =>
        `${p.name} ${p.last_name}`.toLowerCase().includes(query) ||
        (p.user?.email || "").toLowerCase().includes(query)
    );
  }

  get isAllSelected(): boolean {
    return this.assignees.length > 0 && this.selectedIds.size === this.assignees.length;
  }

  isSelected(id: string): boolean {
    return this.selectedIds.has(id);
  }
}
