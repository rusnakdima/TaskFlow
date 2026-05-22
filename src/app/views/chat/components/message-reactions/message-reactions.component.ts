import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";

export interface Reaction {
  emoji: string;
  count: number;
  isOwn: boolean;
}

@Component({
  selector: "app-message-reactions",
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: "./message-reactions.component.html",
  styleUrls: ["./message-reactions.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MessageReactionsComponent {
  @Input() reactions: Reaction[] = [];
  @Input() showPicker = false;
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
