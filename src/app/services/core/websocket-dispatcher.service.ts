/* sys lib */
import { Injectable, inject } from "@angular/core";

/* services */
import { StorageService, StorageEntity } from "@services/core/storage.service";

@Injectable({
  providedIn: "root",
})
export class WebSocketDispatcherService {
  private storageService = inject(StorageService);

  /**
   * Initialize all WebSocket listeners and map them to StorageService updates
   */
  initWebSocketListeners(): void {
    const entities: Array<Exclude<StorageEntity, "profiles">> = [
      "todos",
      "tasks",
      "subtasks",
      "categories",
      "comments",
    ];

    entities.forEach((entity) => {
      window.addEventListener(`ws-${entity}-created`, (event: any) =>
        this.storageService.addItem(entity, event.detail)
      );
      window.addEventListener(`ws-${entity}-updated`, (event: any) =>
        this.storageService.updateItem(entity, event.detail.id, event.detail)
      );
      window.addEventListener(`ws-${entity}-deleted`, (event: any) => {
        // Check if this is a soft delete (isDeleted flag set) or hard delete
        const data = event.detail;
        if (data.isDeleted === true) {
          // Soft delete - update the item with isDeleted flag
          this.storageService.updateItem(entity, data.id, data);
        } else {
          // Hard delete - remove from storage
          this.storageService.removeItem(entity, data.id);
        }
      });
    });
  }
}
