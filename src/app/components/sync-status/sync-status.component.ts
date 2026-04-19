/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, inject, OnInit, signal, OnDestroy } from "@angular/core";
import { Subscription } from "rxjs";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { MatTooltipModule } from "@angular/material/tooltip";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";

/* services */
import { OfflineQueueService } from "@services/core/offline-queue.service";
import { ConflictDetectionService } from "@services/core/conflict-detection.service";
import { SyncProgressService } from "@services/core/sync-progress.service";

@Component({
  selector: "app-sync-status",
  standalone: true,
  imports: [CommonModule, MatIconModule, MatTooltipModule, MatProgressSpinnerModule],
  templateUrl: "./sync-status.component.html",
  styles: [
    `
      .sync-status-container {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 4px 8px;
        border-radius: 8px;
        background: rgba(0, 0, 0, 0.05);
      }

      .status-item {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: #666;
      }

      .status-item.online {
        color: #10b981;
      }

      .status-item.offline {
        color: #ef4444;
      }

      .status-item.pending {
        color: #f59e0b;
      }

      .status-item.conflict {
        color: #ef4444;
      }

      .badge {
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 20px;
        height: 20px;
        padding: 0 6px;
        border-radius: 10px;
        font-size: 11px;
        font-weight: 600;
      }

      .badge.pending {
        background: #fbbf24;
        color: #000;
      }

      .badge.conflict {
        background: #ef4444;
        color: #fff;
      }

      .badge.syncing {
        background: #3b82f6;
        color: #fff;
      }

      .status-item.syncing {
        color: #3b82f6;
      }

      .sync-progress-text {
        font-size: 11px;
        max-width: 100px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .spinner-container {
        display: flex;
        align-items: center;
        justify-content: center;
      }
    `,
  ],
})
export class SyncStatusComponent implements OnInit, OnDestroy {
  private offlineQueueService = inject(OfflineQueueService);
  private conflictDetectionService = inject(ConflictDetectionService);
  private syncProgressService = inject(SyncProgressService);

  isOnline = signal(true);
  pendingCount = signal(0);
  conflictCount = signal(0);
  isProcessing = signal(false);
  hasPendingOperations = signal(false);

  readonly isSyncing = this.syncProgressService.isActive;
  readonly syncProgress = this.syncProgressService.progressPercent;
  readonly syncMessage = this.syncProgressService.displayMessage;

  private subscriptions: Subscription[] = [];

  ngOnInit() {
    // Subscribe to online status
    this.subscriptions.push(
      this.offlineQueueService.isOnline$().subscribe((online) => {
        this.isOnline.set(online);
      })
    );

    // Subscribe to queue size
    this.subscriptions.push(
      this.offlineQueueService.queueSize$().subscribe((size) => {
        this.pendingCount.set(size);
        this.hasPendingOperations.set(size > 0);
      })
    );

    // Subscribe to processing status
    this.subscriptions.push(
      this.offlineQueueService.isProcessing$().subscribe((processing) => {
        this.isProcessing.set(processing);
      })
    );

    // Subscribe to conflicts
    this.subscriptions.push(
      this.conflictDetectionService.getConflicts$().subscribe((conflicts) => {
        this.conflictCount.set(conflicts.filter((c) => !c.resolved).length);
      })
    );

    // Initial values
    this.isOnline.set(this.offlineQueueService.isOnline());
    this.pendingCount.set(this.offlineQueueService.getQueueSize());
    this.conflictCount.set(
      this.conflictDetectionService.getConflicts().filter((c) => !c.resolved).length
    );
  }

  ngOnDestroy() {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
  }

  get statusMessage(): string {
    if (this.conflictCount() > 0) {
      return `${this.conflictCount()} conflict(s) to resolve`;
    }
    if (this.pendingCount() > 0) {
      return `${this.pendingCount()} operation(s) pending`;
    }
    if (this.isOnline()) {
      return "All changes synced";
    }
    return "Working offline";
  }

  get statusIcon(): string {
    if (this.conflictCount() > 0) {
      return "warning";
    }
    if (this.pendingCount() > 0) {
      return "sync_problem";
    }
    if (this.isOnline()) {
      return "cloud_done";
    }
    return "cloud_off";
  }

  get statusClass(): string {
    if (this.conflictCount() > 0) {
      return "conflict";
    }
    if (this.pendingCount() > 0) {
      return "pending";
    }
    if (this.isOnline()) {
      return "online";
    }
    return "offline";
  }

  triggerSync() {
    this.offlineQueueService.triggerSync();
  }
}
