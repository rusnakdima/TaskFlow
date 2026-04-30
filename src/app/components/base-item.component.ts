/* sys lib */
import { Directive, signal, inject } from "@angular/core";
import { ChangeDetectorRef } from "@angular/core";

/**
 * Abstract base for item components (Task, Subtask, Todo).
 * Contains methods that are identical across all three components.
 */
@Directive()
export abstract class BaseItemComponent {
  protected cdr = inject(ChangeDetectorRef);

  editingField = signal<string | null>(null);
  editingValue = signal("");

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
