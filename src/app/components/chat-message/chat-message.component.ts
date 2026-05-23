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
import { ChatMessage } from "../../models/chat.model";
import { MessageReactionsComponent } from "../../views/chat/components/message-reactions/message-reactions.component";

@Component({
  selector: "app-chat-message",
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MessageReactionsComponent],
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
  @Output() contextMenu = new EventEmitter<{ event: MouseEvent; message: ChatMessage }>();
  @Output() editMessageInput = new EventEmitter<string>();
  @Output() reply = new EventEmitter<ChatMessage>();
  @Output() react = new EventEmitter<{ message: ChatMessage; emoji: string }>();
  @Output() removeReaction = new EventEmitter<{ message: ChatMessage; emoji: string }>();
  @Output() cancelReply = new EventEmitter<ChatMessage>();
  @Output() retrySend = new EventEmitter<ChatMessage>();

  showReactionPicker = signal(false);

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
    this.showReactionPicker.set(false);
  }

  onRemoveReaction(payload: { message: ChatMessage; emoji: string }): void {
    this.removeReaction.emit(payload);
  }

  onCancelReply(message: ChatMessage): void {
    this.cancelReply.emit(message);
  }

  onToggleReactionPicker(): void {
    this.showReactionPicker.update((v) => !v);
  }

  onQuickReaction(emoji: string): void {
    this.react.emit({ message: this.message, emoji });
  }

  onPickerClosed(): void {
    this.showReactionPicker.set(false);
  }

  onRetrySend(): void {
    this.retrySend.emit(this.message);
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
      "relative flex flex-col min-h-11 px-4 py-3 rounded-3xl max-w-full word-break transition-all duration-200 ease-out";

    if (this.isOwn) {
      return `${base} bg-gradient-to-br from-[var(--accent-400)] to-[var(--accent-600)] text-white border border-white/20 shadow`;
    }

    return `${base} bg-white backdrop-blur-md border border-black/5 text-zinc-800 shadow-sm dark:bg-zinc-800 dark:border-white/10 dark:text-zinc-100`;
  }
}
