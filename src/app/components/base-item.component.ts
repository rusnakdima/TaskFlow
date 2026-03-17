/* sys lib */
import { Directive, EventEmitter, Output, signal, inject } from "@angular/core";
import { ChangeDetectorRef } from "@angular/core";

/**
 * Abstract base for item components (Task, Subtask, Todo).
 * Contains methods that are identical across all three components.
 */
@Directive()
export abstract class BaseItemComponent {
  protected cdr = inject(ChangeDetectorRef);

  @Output() edit = new EventEmitter<void>();
  @Output() delete = new EventEmitter<void>();
  @Output() toggle = new EventEmitter<void>();

  editingField = signal<string | null>(null);
  editingValue = signal("");

  onEditClick(): void {
    this.edit.emit();
  }

  onDeleteClick(): void {
    this.delete.emit();
  }

  onToggleClick(): void {
    this.toggle.emit();
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

  cancelInlineEdit() {
    this.editingField.set(null);
    this.editingValue.set("");
    this.cdr.markForCheck();
  }
}
