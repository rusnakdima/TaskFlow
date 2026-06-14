import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { Reaction } from "@models/chat.model";

@Component({
  selector: "app-message-reactions",
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: "./message-reactions.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MessageReactionsComponent {
  @Input() reactions: Reaction[] = [];
  @Input() showPicker = false;
  @Input() alignLeft = false;
  @Output() togglePicker = new EventEmitter<void>();
  @Output() addReaction = new EventEmitter<string>();
  @Output() removeReaction = new EventEmitter<string>();
  @Output() pickerClosed = new EventEmitter<void>();

  quickReactions = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

  onQuickReaction(emoji: string): void {
    this.addReaction.emit(emoji);
    this.pickerClosed.emit();
  }
}
