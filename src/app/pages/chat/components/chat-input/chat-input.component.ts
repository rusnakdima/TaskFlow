import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { MatIconModule } from "@angular/material/icon";
import { EmojiTab, ChatMessage } from "@entities/chat.model";

@Component({
  selector: "app-chat-input",
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: "./chat-input.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatInputComponent {
  @Input() messageInput = "";
  @Input() showEmojiPicker = false;
  @Input() showAttachmentMenu = false;
  @Input() activeEmojiTab: EmojiTab = "smileys";
  @Input() recentEmojis: string[] = [];
  @Input() smileysEmojis: string[] = [];
  @Input() gesturesEmojis: string[] = [];
  @Input() objectsEmojis: string[] = [];
  @Input() recentEmojisDefault: string[] = [];
  @Input() replyTo: ChatMessage | null = null;

  @Output() inputChange = new EventEmitter<string>();
  @Output() send = new EventEmitter<void>();
  @Output() keydown = new EventEmitter<KeyboardEvent>();
  @Output() emojiSelect = new EventEmitter<string>();
  @Output() toggleEmojiPicker = new EventEmitter<void>();
  @Output() toggleAttachmentMenu = new EventEmitter<void>();
  @Output() setEmojiTab = new EventEmitter<EmojiTab>();
  @Output() cancelReply = new EventEmitter<void>();

  onInputChange(value: string): void {
    this.inputChange.emit(value);
  }

  onSend(): void {
    this.send.emit();
  }

  onKeydown(event: KeyboardEvent): void {
    this.keydown.emit(event);
  }

  onEmojiSelect(emoji: string): void {
    this.emojiSelect.emit(emoji);
  }

  onToggleEmojiPicker(): void {
    this.toggleEmojiPicker.emit();
  }

  onToggleAttachmentMenu(): void {
    this.toggleAttachmentMenu.emit();
  }

  onSetEmojiTab(tab: EmojiTab): void {
    this.setEmojiTab.emit(tab);
  }

  onCancelReply(): void {
    this.cancelReply.emit();
  }

  get currentEmojis(): string[] {
    switch (this.activeEmojiTab) {
      case "recent":
        return this.recentEmojis.length > 0 ? this.recentEmojis : this.recentEmojisDefault;
      case "smileys":
        return this.smileysEmojis || [];
      case "gestures":
        return this.gesturesEmojis || [];
      case "objects":
        return this.objectsEmojis || [];
      default:
        return [];
    }
  }
}
