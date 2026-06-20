import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { ChatMessage } from "@entities/chat.model";
@Component({
  selector: "app-reply-preview",
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: "./reply-preview.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReplyPreviewComponent {
  @Input() replyTo: ChatMessage | null = null;
  @Output() cancel = new EventEmitter<void>();
}
