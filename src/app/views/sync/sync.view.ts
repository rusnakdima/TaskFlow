/* sys lib */
import { CommonModule } from "@angular/common";
import { Component } from "@angular/core";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";

/* models */
import { ResponseStatus } from "@models/response";

/* services */
import { SyncService } from "@services/sync.service";
import { NotifyService } from "@services/notify.service";

@Component({
  selector: "app-sync",
  standalone: true,
  providers: [SyncService],
  imports: [CommonModule, MatIconModule, MatButtonModule, MatProgressSpinnerModule],
  templateUrl: "./sync.view.html",
})
export class SyncView {
  constructor(
    private syncService: SyncService,
    private notifyService: NotifyService
  ) {}

  isSyncingAll = false;
  isSyncingImport = false;
  isSyncingExport = false;

  async syncAll() {
    if (this.isSyncingAll) return;

    this.isSyncingAll = true;
    this.notifyService.showInfo("Starting full synchronization...");

    try {
      const response = await this.syncService.syncAll();
      if (response.status === ResponseStatus.SUCCESS) {
        this.notifyService.showSuccess("Full synchronization completed successfully!");
      } else {
        this.notifyService.showError(response.message || "Full synchronization failed");
      }
    } catch (error) {
      console.error(error);
      this.notifyService.showError("Full synchronization failed: " + error);
    } finally {
      this.isSyncingAll = false;
    }
  }

  async importToLocal() {
    if (this.isSyncingImport) return;

    this.isSyncingImport = true;
    this.notifyService.showInfo("Importing data from cloud to local...");

    try {
      const response = await this.syncService.importToLocal();
      if (response.status === ResponseStatus.SUCCESS) {
        this.notifyService.showSuccess("Data imported from cloud successfully!");
      } else {
        this.notifyService.showError(response.message || "Import from cloud failed");
      }
    } catch (error) {
      console.error(error);
      this.notifyService.showError("Import from cloud failed: " + error);
    } finally {
      this.isSyncingImport = false;
    }
  }

  async exportToCloud() {
    if (this.isSyncingExport) return;

    this.isSyncingExport = true;
    this.notifyService.showInfo("Exporting local data to cloud...");

    try {
      const response = await this.syncService.exportToCloud();
      if (response.status === ResponseStatus.SUCCESS) {
        this.notifyService.showSuccess("Local data exported to cloud successfully!");
      } else {
        this.notifyService.showError(response.message || "Export to cloud failed");
      }
    } catch (error) {
      console.error(error);
      this.notifyService.showError("Export to cloud failed: " + error);
    } finally {
      this.isSyncingExport = false;
    }
  }
}
