import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ChatMessage } from "../../models/chat.model";
import { ChatMessageComponent } from "../chat-message/chat-message.component";

@Component({
  selector: "app-chat-message-group",
  standalone: true,
  imports: [CommonModule, ChatMessageComponent],
  templateUrl: "./chat-message-group.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatMessageGroupComponent {
  @Input() messages: ChatMessage[] = [];
  @Input() isGroupChat = false;
  @Input() isOwn = false;

  @Output() reply = new EventEmitter<ChatMessage>();
  @Output() react = new EventEmitter<{ message: ChatMessage; emoji: string }>();
  @Output() removeReaction = new EventEmitter<{ message: ChatMessage; emoji: string }>();
  @Output() contextMenu = new EventEmitter<{ event: MouseEvent; message: ChatMessage }>();
  @Output() saveEdit = new EventEmitter<void>();
  @Output() cancelEdit = new EventEmitter<void>();
  @Output() editMessageInput = new EventEmitter<string>();
  @Output() cancelReply = new EventEmitter<ChatMessage>();
  @Output() retrySend = new EventEmitter<ChatMessage>();
}
