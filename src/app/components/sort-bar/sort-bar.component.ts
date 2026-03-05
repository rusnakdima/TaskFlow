/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
import { MatMenuModule } from "@angular/material/menu";
import { MatSelectModule } from "@angular/material/select";
import { MatFormFieldModule } from "@angular/material/form-field";

/**
 * Sort option interface
 */
export interface SortOption {
  field: string;
  label: string;
}

@Component({
  selector: "app-sort-bar",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatSelectModule,
    MatFormFieldModule,
  ],
  templateUrl: "./sort-bar.component.html",
})
export class SortBarComponent {
  @Input() sortOptions: SortOption[] = [
    { field: "createdAt", label: "Date Created" },
    { field: "updatedAt", label: "Last Updated" },
    { field: "title", label: "Title" },
    { field: "order", label: "Order" },
  ];
  @Input() sortBy: string = "createdAt";
  @Input() sortOrder: "asc" | "desc" = "desc";

  @Output() sortChange = new EventEmitter<{ field: string; order: "asc" | "desc" }>();

  onSortFieldChange(field: string) {
    this.sortBy = field;
    this.sortChange.emit({ field, order: this.sortOrder });
  }

  onSortOrderChange() {
    this.sortOrder = this.sortOrder === "asc" ? "desc" : "asc";
    this.sortChange.emit({ field: this.sortBy, order: this.sortOrder });
  }

  toggleSortOrder() {
    this.onSortOrderChange();
  }
}
