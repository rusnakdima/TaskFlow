import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  signal,
  OnInit,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { MatIconModule } from "@angular/material/icon";
import { ChatMessage } from "@entities/chat.model";
import { MessageReactionsComponent } from "@pages/chat/components/message-reactions/message-reactions.component";
import { UserAvatarComponent } from "@components/user-avatar/user-avatar.component";
@Component({
  selector: "app-chat-message",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MessageReactionsComponent,
    UserAvatarComponent,
  ],
  templateUrl: "./chat-message.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatMessageComponent implements OnInit {
  @Input() message!: ChatMessage;
  @Input() isGroupStart = false;
  @Input() isGroupChat = false;
  @Input() isGrouped = false;
  @Input() editingMessageId: string | null = null;
  @Input() editingMessageContent = "";
  @Output() saveEdit = new EventEmitter<void>();
  @Output() cancelEdit = new EventEmitter<void>();
  @Output() contextMenu = new EventEmitter<{
    event: MouseEvent;
    message: ChatMessage;
    isOwn: boolean;
  }>();
  @Output() editMessageInput = new EventEmitter<string>();
  @Output() reply = new EventEmitter<ChatMessage>();
  @Output() react = new EventEmitter<{ message: ChatMessage; emoji: string }>();
  @Output() removeReaction = new EventEmitter<{ message: ChatMessage; emoji: string }>();
  @Output() cancelReply = new EventEmitter<ChatMessage>();
  @Output() retrySend = new EventEmitter<ChatMessage>();
  @Output() deleteMessage = new EventEmitter<ChatMessage>();
  @Output() startEditMessage = new EventEmitter<ChatMessage>();
  showReactionPicker = signal(false);
  showEmojiGrid = signal(false);
  isHovered = signal(false);
  quickEmojis = ["😀", "😂", "❤️", "🥰", "😍", "🎉", "🔥", "👍", "👎"];
  ngOnInit(): void {}
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
    console.debug("onContextMenu", {
      event,
      message: this.message,
      isOwn: this.isOwn,
    });
    event.preventDefault();
    event.stopPropagation();
    this.contextMenu.emit({ event, message: this.message, isOwn: this.isOwn });
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
    this.showReactionPicker.set(false);
    this.showEmojiGrid.set(false);
  }
  onRemoveReaction(payload: { message: ChatMessage; emoji: string }): void {
    this.removeReaction.emit(payload);
    this.showEmojiGrid.set(false);
  }
  onCancelReply(message: ChatMessage): void {
    this.cancelReply.emit(message);
  }
  onToggleReactionPicker(): void {
    this.showReactionPicker.update((v) => !v);
  }
  onToggleEmojiGrid(): void {
    this.showEmojiGrid.update((v) => !v);
  }
  onMouseLeave(): void {
    this.isHovered.set(false);
    this.showEmojiGrid.set(false);
  }
  onMouseEnter(): void {
    this.isHovered.set(true);
  }
  onQuickReaction(emoji: string): void {
    this.react.emit({ message: this.message, emoji });
    this.showEmojiGrid.set(false);
  }
  onPickerClosed(): void {
    this.showReactionPicker.set(false);
  }
  onRetrySend(): void {
    this.retrySend.emit(this.message);
  }
  onDeleteMessage(): void {
    this.deleteMessage.emit(this.message);
  }
  startEditMessageInline(): void {
    this.startEditMessage.emit(this.message);
  }
  formatTime(time: string): string {
    if (!time || time === "Invalid Date") {
      return new Date().toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    }
    const date = new Date(time);
    if (isNaN(date.getTime())) {
      return new Date().toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    }
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  }
  getBubbleClasses(): string {
    const base =
      "relative flex flex-col min-h-[44px] px-4 py-3 rounded-2xl rounded-tr-sm max-w-full word-break transition-all duration-200 ease-out";
    if (this.isOwn) {
      return `${base} bg-[var(--accent-color)] text-white shadow-lg shadow-[var(--accent-color)]/10`;
    }
    return `${base} bg-white dark:bg-zinc-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-zinc-700 shadow-sm`;
  }
}
