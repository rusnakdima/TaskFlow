/* sys lib */
import { Component } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";

/* components */
import { ChatWindowComponent } from "@components/chat-window/chat-window.component";

@Component({
  selector: "app-chat",
  standalone: true,
  imports: [CommonModule, FormsModule, ChatWindowComponent],
  templateUrl: "./chat.view.html",
})
export class ChatView {
  // No inputs needed, ChatWindowComponent will handle global chat
}
