/* sys lib */
import { Directive, signal, inject, EventEmitter, HostListener } from "@angular/core";
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
  isMenuOpen = signal(false);

  abstract get item(): { id: string; title?: string; description?: string } | null;
  abstract get updateEvent(): EventEmitter<any>;
  abstract get menuClass(): string;

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

  @HostListener("document:click", ["$event"])
  onDocumentClick(event: Event) {
    const target = event.target as HTMLElement;
    if (this.isMenuOpen() && !target.closest("." + this.menuClass)) {
      this.closeMenu();
    }
  }

  toggleMenu(event: any) {
    event.stopPropagation();
    this.isMenuOpen.update((v) => !v);
    this.cdr.markForCheck();
  }

  closeMenu() {
    if (this.isMenuOpen()) {
      this.isMenuOpen.set(false);
      this.cdr.markForCheck();
    }
  }
}
