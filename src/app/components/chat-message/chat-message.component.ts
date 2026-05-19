import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { MatIconModule } from "@angular/material/icon";
import { ChatMessage } from "../../models/chat.model";
import { UserAvatarComponent } from "../user-avatar/user-avatar.component";
import { MessageReactionsComponent } from "../../views/chat/components/message-reactions/message-reactions.component";
import { ReplyPreviewComponent } from "../../views/chat/components/reply-preview/reply-preview.component";

@Component({
  selector: "app-chat-message",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    UserAvatarComponent,
    MessageReactionsComponent,
    ReplyPreviewComponent,
  ],
  templateUrl: "./chat-message.component.html",
  styleUrls: ["./chat-message.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatMessageComponent {
  @Input() message!: ChatMessage;
  @Input() isGroupStart = false;
  @Input() isGroupChat = false;
  @Input() editingMessageId: string | null = null;
  @Input() editingMessageContent = "";

  @Output() saveEdit = new EventEmitter<void>();
  @Output() cancelEdit = new EventEmitter<void>();
  @Output() contextMenu = new EventEmitter<{ event: MouseEvent; message: ChatMessage }>();
  @Output() editMessageInput = new EventEmitter<string>();
  @Output() reply = new EventEmitter<ChatMessage>();
  @Output() react = new EventEmitter<{ message: ChatMessage; emoji: string }>();
  @Output() removeReaction = new EventEmitter<{ message: ChatMessage; emoji: string }>();
  @Output() cancelReply = new EventEmitter<ChatMessage>();

  get isOwn(): boolean {
    return this.message?.isMine ?? false;
  }

  get isEditing(): boolean {
    return this.editingMessageId === this.message?.id;
  }

  onEditInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    this.editMessageInput.emit(target.value);
  }

  onContextMenu(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.contextMenu.emit({ event, message: this.message });
  }

  onSaveEdit(): void {
    this.saveEdit.emit();
  }

  onCancelEdit(): void {
    this.cancelEdit.emit();
  }

  onReply(message: ChatMessage): void {
    this.reply.emit(message);
  }

  onReact(payload: { message: ChatMessage; emoji: string }): void {
    this.react.emit(payload);
  }

  onRemoveReaction(payload: { message: ChatMessage; emoji: string }): void {
    this.removeReaction.emit(payload);
  }

  onCancelReply(message: ChatMessage): void {
    this.cancelReply.emit(message);
  }
}
