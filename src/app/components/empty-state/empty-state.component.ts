import { Component, Input, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterModule } from "@angular/router";
import { MatIconModule } from "@angular/material/icon";
@Component({
  selector: "app-empty-state",
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule],
  templateUrl: "./empty-state.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmptyStateComponent {
  @Input() icon = "inbox";
  @Input() title = "Nothing here yet";
  @Input() message?: string;
  @Input() actionLabel?: string;
  @Input() actionLink?: string;
  @Input() actionCallback?: () => void;
  onAction(): void {
    this.actionCallback?.();
  }
}
