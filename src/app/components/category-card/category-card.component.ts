/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output } from "@angular/core";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* components */
import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";

/* constants */
import { ActionColors } from "@constants/table-field.constants";

/* models */
import { Category } from "@models/category.model";

@Component({
  selector: "app-category-card",
  standalone: true,
  imports: [CommonModule, MatIconModule, CheckboxComponent],
  templateUrl: "./category-card.component.html",
})
export class CategoryCardComponent {
  @Input() category!: Category;
  @Input() isSelected: boolean = false;

  @Output() edit = new EventEmitter<Category>();
  @Output() archive = new EventEmitter<string>();
  @Output() delete = new EventEmitter<string>();
  @Output() selectionChangeEvent = new EventEmitter<string>();

  onEdit() {
    this.edit.emit(this.category);
  }

  onArchive() {
    this.archive.emit(this.category.id);
  }

  onDelete() {
    this.delete.emit(this.category.id);
  }

  toggleSelection(_result: { checked: boolean; event?: MouseEvent }) {
    this.selectionChangeEvent.emit(this.category.id);
  }

  getActionColor(action: string): string {
    const colorKey = action as keyof typeof ActionColors;
    const baseClass = "p-1 transition-colors";
    return `${baseClass} ${ActionColors[colorKey] || ActionColors.default}`;
  }
}
