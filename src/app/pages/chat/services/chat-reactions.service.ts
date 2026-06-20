import { Injectable, inject } from "@angular/core";
import { ChatState } from "../state/chat.state";
import { ApiService } from "@services/api.service";
import { AuthService } from "@services/auth/auth.service";
import { NotifyService } from "@services/notifications/notify.service";
@Injectable({ providedIn: "root" })
export class ChatReactionsService {
  private requestService = inject(ApiService);
  private authService = inject(AuthService);
  private notifyService = inject(NotifyService);
  state = inject(ChatState);
  addReaction(messageId: string, emoji: string): void {
    this.requestService
      .invokeCommand("add_message_reaction", {
        messageId,
        emoji,
        token: this.authService.getToken(),
      })
      .subscribe({
        next: () => {
          this.state.messages.update((msgs) =>
            msgs.map((m) => {
              if (m.id === messageId) {
                const reactions = m.reactions || [];
                const existing = reactions.find((r) => r.emoji === emoji);
                if (existing) {
                  return {
                    ...m,
                    reactions: reactions.map((r) =>
                      r.emoji === emoji ? { ...r, count: r.count + 1, isOwn: true } : r
                    ),
                  };
                } else {
                  return {
                    ...m,
                    reactions: [...reactions, { emoji, count: 1, isOwn: true }],
                  };
                }
              }
              return m;
            })
          );
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to add reaction");
        },
      });
  }
  removeReaction(messageId: string, emoji: string): void {
    this.requestService
      .invokeCommand("remove_message_reaction", {
        messageId,
        emoji,
        token: this.authService.getToken(),
      })
      .subscribe({
        next: () => {
          this.state.messages.update((msgs) =>
            msgs.map((m) => {
              if (m.id === messageId) {
                const reactions = m.reactions || [];
                const existing = reactions.find((r) => r.emoji === emoji);
                if (existing && existing.count > 1) {
                  return {
                    ...m,
                    reactions: reactions.map((r) =>
                      r.emoji === emoji ? { ...r, count: r.count - 1 } : r
                    ),
                  };
                } else {
                  return {
                    ...m,
                    reactions: reactions.filter((r) => r.emoji !== emoji),
                  };
                }
              }
              return m;
            })
          );
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to remove reaction");
        },
      });
  }
}
