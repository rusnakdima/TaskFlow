import { Component, inject, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { MatIconModule } from "@angular/material/icon";
import { Router } from "@angular/router";
import { ChatService } from "./services/chat.service";
import { ChatState } from "./state/chat.state";

@Component({
  selector: "app-create-group",
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: "./create-group.page.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateGroupView {
  chatService = inject(ChatService);
  state = inject(ChatState);
  private router = inject(Router);

  onCreateGroup(): void {
    const name = this.state.newGroupName().trim();
    if (name) {
      this.chatService.createGroup(name);
      this.router.navigate(["/chat"]);
    }
  }

  onCancel(): void {
    this.state.newGroupName.set("");
    this.state.showCreateGroupModal.set(false);
    this.router.navigate(["/chat"]);
  }
}
