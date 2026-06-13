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
  templateUrl: "./actions-menu.component.html",
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
