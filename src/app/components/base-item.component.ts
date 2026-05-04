/* sys lib */
import { Directive, signal, inject, EventEmitter } from "@angular/core";
import { ChangeDetectorRef } from "@angular/core";

export interface ItemUpdateEvent {
  field: string;
  value: any;
  task?: any;
  subtask?: any;
}

/**
 * Abstract base for item components (Task, Subtask, Todo).
 * Contains methods that are identical across all three components.
 */
@Directive()
export abstract class BaseItemComponent {
  protected cdr = inject(ChangeDetectorRef);

  editingField = signal<string | null>(null);
  editingValue = signal("");

  abstract get item(): { id: string; title?: string; description?: string } | null;

  abstract get updateEvent(): EventEmitter<any>;

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

  cancelInlineEdit() {
    this.editingField.set(null);
    this.editingValue.set("");
    this.cdr.markForCheck();
  }

  saveInlineEdit(): void {
    if (this.editingValue().trim() && this.editingField() && this.item) {
      const field = this.editingField()!;
      const originalValue = field === "title" ? this.item.title : this.item.description;
      if (this.editingValue().trim() !== (originalValue ?? "").trim()) {
        this.updateEvent.emit({
          field,
          value: this.editingValue().trim(),
        });
      }
    }
    this.cancelInlineEdit();
  }
}
