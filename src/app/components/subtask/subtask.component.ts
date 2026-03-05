/* sys lib */
import { CommonModule } from "@angular/common";
import {
  Component,
  EventEmitter,
  Input,
  Output,
  signal,
  inject,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from "@angular/core";
import { RouterModule } from "@angular/router";
import { FormsModule } from "@angular/forms";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { DragDropModule } from "@angular/cdk/drag-drop";

/* helpers */
import { Common } from "@helpers/common.helper";
import { BaseItemHelper } from "@helpers/base-item.helper";

/* models */
import { Subtask } from "@models/subtask.model";

@Component({
  selector: "app-subtask",
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, MatIconModule, DragDropModule],
  templateUrl: "./subtask.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubtaskComponent {
  private baseHelper = inject(BaseItemHelper);

  constructor(private cdr: ChangeDetectorRef) {}

  @Input() subtask: Subtask | null = null;
  @Input() index: number = 0;
  @Input() isPrivate: boolean = true;

  @Output() deleteSubtaskEvent: EventEmitter<string> = new EventEmitter();
  @Output() toggleCompletionEvent: EventEmitter<Subtask> = new EventEmitter();
  @Output() updateSubtaskEvent: EventEmitter<{ subtask: Subtask; field: string; value: string }> =
    new EventEmitter();

  editingField = signal<string | null>(null);
  editingValue = signal("");

  truncateString = Common.truncateString;

  getPriorityColor = this.baseHelper.getPriorityBadgeClass;

  toggleCompletion() {
    if (this.subtask) {
      this.toggleCompletionEvent.emit(this.subtask);
      this.cdr.markForCheck();
    }
  }

  startInlineEdit(field: string, currentValue: string) {
    this.editingField.set(field);
    this.editingValue.set(currentValue);
    this.cdr.markForCheck();

    setTimeout(() => {
      const input = document.querySelector("input:focus, textarea:focus") as HTMLInputElement;
      if (input) {
        input.select();
      }
    }, 0);
  }

  saveInlineEdit() {
    if (this.editingValue().trim() && this.editingField() && this.subtask) {
      const originalValue =
        this.editingField() === "title" ? this.subtask.title : this.subtask.description;
      if (this.editingValue().trim() !== originalValue) {
        this.updateSubtaskEvent.emit({
          subtask: this.subtask,
          field: this.editingField()!,
          value: this.editingValue().trim(),
        });
      }
    }
    this.cancelInlineEdit();
  }

  cancelInlineEdit() {
    this.editingField.set(null);
    this.editingValue.set("");
    this.cdr.markForCheck();
  }

  deleteSubtask() {
    if (this.subtask) {
      this.deleteSubtaskEvent.emit(this.subtask.id);
    }
  }
}
