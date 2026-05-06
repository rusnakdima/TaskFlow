/* sys lib */
import { Component, inject, computed, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { MatTooltipModule } from "@angular/material/tooltip";

/* services */
import { MongoConnectionService } from "@services/core/mongo-connection.service";

@Component({
  selector: "app-connection-status",
  standalone: true,
  imports: [CommonModule, MatIconModule, MatTooltipModule],
  template: `
    <div
      class="connection-status"
      [class]="'status-' + connectionStatus()"
      [matTooltip]="statusTooltip()"
      (click)="refreshConnection()"
    >
      <span class="status-dot"></span>
      <span class="status-label">{{ statusLabel() }}</span>
    </div>
  `,
  styles: [
    `
      .connection-status {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        border-radius: 16px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
        transition: all 0.2s ease;
      }

      .connection-status:hover {
        opacity: 0.8;
      }

      .status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
      }

      .status-offline {
        background-color: rgba(239, 68, 68, 0.1);
        color: #ef4444;
      }

      .status-offline .status-dot {
        background-color: #ef4444;
        box-shadow: 0 0 4px #ef4444;
      }

      .status-connecting {
        background-color: rgba(251, 191, 36, 0.1);
        color: #f59e0b;
      }

      .status-connecting .status-dot {
        background-color: #f59e0b;
        animation: pulse 1.5s infinite;
      }

      .status-connected {
        background-color: rgba(34, 197, 94, 0.1);
        color: #22c55e;
      }

      .status-connected .status-dot {
        background-color: #22c55e;
      }

      .status-label {
        white-space: nowrap;
      }

      @keyframes pulse {
        0%,
        100% {
          opacity: 1;
        }
        50% {
          opacity: 0.4;
        }
      }
    `,
  ],
})
export class ConnectionStatusComponent {
  private mongoConnectionService = inject(MongoConnectionService);

  connectionStatus = this.mongoConnectionService.connectionStatus;

  statusLabel = computed(() => {
    switch (this.connectionStatus()) {
      case "offline":
        return "Offline";
      case "connecting":
        return "Connecting...";
      case "connected":
        return "Connected";
    }
  });

  statusTooltip = computed(() => {
    switch (this.connectionStatus()) {
      case "offline":
        return "MongoDB is offline. Click to retry.";
      case "connecting":
        return "Checking MongoDB connection...";
      case "connected":
        return "MongoDB is connected";
    }
  });

  refreshConnection(): void {
    this.mongoConnectionService.checkConnection().subscribe();
  }
}
