/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output } from "@angular/core";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { Category } from "@models/category";

@Component({
  selector: "app-category-card",
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: "./category-card.component.html",
})
export class CategoryCardComponent {
  @Input() category!: Category;

  @Output() edit = new EventEmitter<Category>();
  @Output() delete = new EventEmitter<string>();

  onEdit() {
    this.edit.emit(this.category);
  }

  onDelete() {
    this.delete.emit(this.category.id);
  }
}
