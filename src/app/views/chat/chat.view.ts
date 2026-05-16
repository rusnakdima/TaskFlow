/* sys lib */
import { Component, OnInit, signal, computed, inject, DestroyRef } from "@angular/core";
import { CommonModule } from "@angular/common";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* components */
import { ChatWindowComponent } from "@components/chat-window/chat-window.component";
import {
  PullToRefreshDirective,
  PullToRefreshIndicatorComponent,
} from "@components/pull-to-refresh";

/* models */
import { Chat } from "@models/generated/api.types";

/* services */
import { ApiService } from "@services/api.service";
import { StorageService } from "@services/storage.service";
import { UnifiedSyncService } from "@services/sync/unified-sync.service";
import { ShortcutService } from "@services/ui/shortcut.service";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";

@Component({
  selector: "app-chat",
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    ChatWindowComponent,
    PullToRefreshDirective,
    PullToRefreshIndicatorComponent,
  ],
  templateUrl: "./chat.view.html",
})
export class ChatView implements OnInit {
  private requestService = inject(ApiService);
  private storageService = inject(StorageService);
  private destroyRef = inject(DestroyRef);
  private syncService = inject(UnifiedSyncService);
  private shortcutService = inject(ShortcutService);

  refreshState = signal<"idle" | "pulling" | "triggered" | "refreshing" | "complete">("idle");
  refreshDistance = signal(0);

  chats = computed(() => this.storageService.chats());
  isLoading = signal(false);
  error = signal<string | null>(null);

  ngOnInit(): void {
    this.loadChats();

    const refreshSub = this.shortcutService.refresh$.subscribe(() => {
      this.refreshState.set("refreshing");
      this.syncService.refreshLocal().finally(() => {
        this.refreshState.set("idle");
      });
    });
    this.destroyRef.onDestroy(() => refreshSub.unsubscribe());
  }

  onPullToRefresh(): Promise<void> {
    return this.syncService.syncAll() as unknown as Promise<void>;
  }

  private loadChats(): void {
    const cachedChats = this.storageService.chats();
    if (cachedChats.length > 0) {
      return;
    }

    this.isLoading.set(true);
    this.error.set(null);

    this.requestService
      .getAll<Chat>("chats", { visibility: "all" })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (chats) => {
          if (chats && chats.length > 0) {
            this.storageService.setCollection("chats", chats);
          }
          this.isLoading.set(false);
        },
        error: (err) => {
          this.isLoading.set(false);
          this.error.set(err.message || "Failed to load chats");
        },
      });
  }

  onMessageSent(_chat: Chat): void {}

  onConversationSelected(_userId: string): void {}
}
