import { Component, Input, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { UserAvatarComponent } from "@components/user-avatar/user-avatar.component";

@Component({
  selector: "app-typing-indicator",
  standalone: true,
  imports: [CommonModule, UserAvatarComponent],
  templateUrl: "./typing-indicator.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TypingIndicatorComponent {
  @Input() userName = "";
  @Input() avatarUrl = "";
}
