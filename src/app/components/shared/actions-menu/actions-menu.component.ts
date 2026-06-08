import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  HostListener,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";

export interface MenuAction {
  key?: string;
  label: string;
  icon?: string;
  disabled?: boolean;
  danger?: boolean;
}

@Component({
  selector: "app-actions-menu",
  standalone: true,
  imports: [CommonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="relative">
      <button
        (click)="toggleMenu($event)"
        class="rounded-lg p-2 text-gray-600 transition-all duration-200 hover:scale-110 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
        [class.opacity-50]="disabled"
        [class.cursor-not-allowed]="disabled"
        [class.pointer-events-none]="disabled"
        [title]="disabled ? disabledText : 'More options'"
      >
        <mat-icon class="h-5! w-5! min-w-5 text-xl!" fontIcon="more_vert" />
      </button>
      @if (isOpen) {
        <div class="fixed inset-0 z-40" (click)="closeMenu()"></div>
        <div
          class="absolute right-0 bottom-full z-50 mb-1 min-w-40 rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-zinc-600 dark:bg-zinc-800"
          (click)="$event.stopPropagation()"
        >
          @for (action of actions; track action.key || action.label) {
            <button
              class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors duration-150"
              [class]="getActionColor(action)"
              [class.opacity-50]="action.disabled"
              [class.cursor-not-allowed]="action.disabled"
              [class.pointer-events-none]="action.disabled"
              [class.hover:bg-gray-100]="!action.disabled && !action.danger"
              [class.dark:hover:bg-gray-700]="!action.disabled && !action.danger"
              [class.hover:bg-red-100]="!action.disabled && action.danger"
              [class.dark:hover:bg-red-900/30]="!action.disabled && action.danger"
              (click)="onAction(action, $event)"
            >
              <mat-icon class="h-4! w-4! min-w-4 text-base!" [fontIcon]="action.icon || 'circle'" />
              {{ action.label }}
            </button>
          }
        </div>
      }
    </div>
  `,
})
export class ActionsMenuComponent {
  @Input() actions: MenuAction[] = [];
  @Input() isOpen = false;
  @Input() disabled = false;
  @Input() disabledText = "Action disabled";
  @Output() menuClosed = new EventEmitter<void>();
  @Output() actionClicked = new EventEmitter<MenuAction>();

  @HostListener("document:keydown.escape")
  onEscapeKey(): void {
    if (this.isOpen) {
      this.closeMenu();
    }
  }

  toggleMenu(event: Event): void {
    event.stopPropagation();
    if (!this.disabled) {
      this.isOpen = !this.isOpen;
      if (!this.isOpen) {
        this.menuClosed.emit();
      }
    }
  }

  closeMenu(): void {
    if (this.isOpen) {
      this.isOpen = false;
      this.menuClosed.emit();
    }
  }

  onAction(action: MenuAction, event: Event): void {
    event.stopPropagation();
    if (!action.disabled) {
      this.actionClicked.emit(action);
      this.closeMenu();
    }
  }

  getActionColor(action: MenuAction): string {
    if (action.danger) {
      return "text-red-600 dark:text-red-400";
    }
    return "text-gray-700 dark:text-gray-200";
  }
}
