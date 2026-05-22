import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatIconModule } from "@angular/material/icon";
import { FormsModule } from "@angular/forms";
import { Category } from "@models/generated/api.types";
import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";

@Component({
  selector: "app-category-section",
  standalone: true,
  imports: [
    CommonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    FormsModule,
    CheckboxComponent,
  ],
  templateUrl: "./category-section.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategorySectionComponent {
  @Input() categories: Category[] = [];
  @Input() selectedIds: Set<string> = new Set();
  @Input() searchQuery = "";
  @Input() disabled = false;
  @Output() searchQueryChange = new EventEmitter<string>();
  @Output() toggleSelection = new EventEmitter<string>();
  @Output() toggleSelectAll = new EventEmitter<void>();
  @Output() addCategory = new EventEmitter<void>();

  get filteredCategories(): Category[] {
    if (!this.searchQuery) return this.categories;
    const query = this.searchQuery.toLowerCase();
    return this.categories.filter((c) => c.title.toLowerCase().includes(query));
  }

  get isAllSelected(): boolean {
    return this.categories.length > 0 && this.selectedIds.size === this.categories.length;
  }

  isSelected(id: string): boolean {
    return this.selectedIds.has(id);
  }
}
