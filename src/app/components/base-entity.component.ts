/* sys lib */
import { Component, Input, Output, EventEmitter } from "@angular/core";

/**
 * Base component for all entity display components (Task, Todo, Subtask, Category).
 * Provides common properties and event emitters for entity actions.
 */
@Component({
  selector: "app-base-entity",
  standalone: true,
  template: "",
})
export abstract class BaseEntityComponent {
  @Input() isOwner: boolean = true;
  @Input() isPrivate: boolean = true;
  @Input() highlight: boolean = false;
  @Input() showActions: boolean = true;

  @Output() edit = new EventEmitter<void>();
  @Output() delete = new EventEmitter<void>();
  @Output() toggle = new EventEmitter<void>();

  /**
   * Handle edit button click
   */
  onEditClick(): void {
    this.edit.emit();
  }

  /**
   * Handle delete button click
   */
  onDeleteClick(): void {
    this.delete.emit();
  }

  /**
   * Handle toggle button click
   */
  onToggleClick(): void {
    this.toggle.emit();
  }
}
