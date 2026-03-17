/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output } from "@angular/core";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* components */
import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";

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
  @Output() delete = new EventEmitter<string>();
  @Output() selectionChangeEvent = new EventEmitter<string>();

  onEdit() {
    this.edit.emit(this.category);
  }

  onDelete() {
    this.delete.emit(this.category.id);
  }

  toggleSelection(_checked: boolean) {
    this.selectionChangeEvent.emit(this.category.id);
  }
}
