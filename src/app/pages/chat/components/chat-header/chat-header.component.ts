import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { ConversationItem } from "@entities/chat.model";
import { UserAvatarComponent } from "@components/user-avatar/user-avatar.component";
@Component({
  selector: "app-chat-header",
  standalone: true,
  imports: [CommonModule, MatIconModule, UserAvatarComponent],
  templateUrl: "./chat-header.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatHeaderComponent {
  @Input() conversation: ConversationItem | null = null;
  @Input() showDetailsPanel = false;
  @Input() isMobile = false;
  @Output() back = new EventEmitter<void>();
  @Output() toggleDetails = new EventEmitter<void>();
  @Output() contextMenu = new EventEmitter<MouseEvent>();
}
