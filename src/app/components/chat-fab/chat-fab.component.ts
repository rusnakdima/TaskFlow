import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";

@Component({
  selector: "app-chat-fab",
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: "./chat-fab.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatFabComponent {
  @Input() isOpen = false;
  @Input() unreadCount = 0;
  @Output() toggle = new EventEmitter<void>();
}
