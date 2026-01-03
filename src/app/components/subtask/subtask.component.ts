/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output } from "@angular/core";
import { RouterModule } from "@angular/router";
import { FormsModule } from "@angular/forms";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { DragDropModule } from "@angular/cdk/drag-drop";

/* helpers */
import { Common } from "@helpers/common.helper";

/* models */
import { Subtask } from "@models/subtask.model";

@Component({
  selector: "app-subtask",
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, MatIconModule, DragDropModule],
  templateUrl: "./subtask.component.html",
})
export class SubtaskComponent {
  constructor() {}

  @Input() subtask: Subtask | null = null;
  @Input() index: number = 0;

  @Output() deleteSubtaskEvent: EventEmitter<string> = new EventEmitter();
  @Output() toggleCompletionEvent: EventEmitter<Subtask> = new EventEmitter();
  @Output() updateSubtaskEvent: EventEmitter<{ subtask: Subtask; field: string; value: string }> =
    new EventEmitter();

  editingField: string | null = null;
  editingValue: string = "";

  truncateString = Common.truncateString;

  getPriorityColor(priority: string): string {
    switch (priority.toLowerCase()) {
      case "high":
        return "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300";
      case "medium":
        return "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300";
      case "low":
        return "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300";
      default:
        return "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300";
    }
  }

  toggleCompletion() {
    if (this.subtask) {
      this.toggleCompletionEvent.emit(this.subtask);
    }
  }

  startInlineEdit(field: string, currentValue: string) {
    this.editingField = field;
    this.editingValue = currentValue;

    setTimeout(() => {
      const input = document.querySelector("input:focus, textarea:focus") as HTMLInputElement;
      if (input) {
        input.select();
      }
    }, 0);
  }

  saveInlineEdit() {
    if (this.editingValue.trim() && this.editingField && this.subtask) {
      const originalValue =
        this.editingField === "title" ? this.subtask.title : this.subtask.description;
      if (this.editingValue.trim() !== originalValue) {
        this.updateSubtaskEvent.emit({
          subtask: this.subtask,
          field: this.editingField,
          value: this.editingValue.trim(),
        });
      }
    }
    this.cancelInlineEdit();
  }

  cancelInlineEdit() {
    this.editingField = null;
    this.editingValue = "";
  }

  deleteSubtask() {
    if (this.subtask && confirm(`Are you sure you want to delete "${this.subtask.title}"?`)) {
      this.deleteSubtaskEvent.emit(this.subtask.id);
    }
  }
}
