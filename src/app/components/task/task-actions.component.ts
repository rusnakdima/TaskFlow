import { Component, Input, Output, EventEmitter, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-task-actions',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="task-actions flex items-center gap-1">
      @if (showActions) {
        <button
          type="button"
          class="p-1 hover:bg-gray-100 rounded"
          (click)="onEdit.emit()"
          title="Edit task"
        >
          <mat-icon class="text-lg">edit</mat-icon>
        </button>
        <button
          type="button"
          class="p-1 hover:bg-gray-100 rounded"
          (click)="onDelete.emit()"
          title="Delete task"
        >
          <mat-icon class="text-lg">delete</mat-icon>
        </button>
        <button
          type="button"
          class="p-1 hover:bg-gray-100 rounded"
          [class.text-blue-600]="isMenuOpen()"
          (click)="toggleMenu($event)"
          title="More actions"
        >
          <mat-icon class="text-lg">more_vert</mat-icon>
        </button>
      }
    </div>
    @if (isMenuOpen()) {
      <div
        class="task-menu absolute right-0 top-full mt-1 bg-white shadow-lg rounded z-50 min-w-32"
      >
        <button
          type="button"
          class="w-full px-3 py-2 text-left hover:bg-gray-100"
          (click)="onEdit.emit(); closeMenu()"
        >
          Edit
        </button>
        <button
          type="button"
          class="w-full px-3 py-2 text-left hover:bg-gray-100"
          (click)="onDuplicate.emit(); closeMenu()"
        >
          Duplicate
        </button>
        <button
          type="button"
          class="w-full px-3 py-2 text-left hover:bg-gray-100"
          (click)="onMove.emit(); closeMenu()"
        >
          Move
        </button>
        <button
          type="button"
          class="w-full px-3 py-2 text-left hover:bg-gray-100"
          (click)="onArchive.emit(); closeMenu()"
        >
          Archive
        </button>
      </div>
    }
  `,
})
export class TaskActionsComponent {
  @Input() showActions = true;
  isMenuOpen = signal(false);

  @Output() onEdit = new EventEmitter<void>();
  @Output() onDelete = new EventEmitter<void>();
  @Output() onDuplicate = new EventEmitter<void>();
  @Output() onMove = new EventEmitter<void>();
  @Output() onArchive = new EventEmitter<void>();

  toggleMenu(event: Event) {
    event.stopPropagation();
    this.isMenuOpen.update((v) => !v);
  }

  closeMenu() {
    this.isMenuOpen.set(false);
  }
}