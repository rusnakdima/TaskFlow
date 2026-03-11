import { inject, Injectable, NgZone, OnDestroy } from "@angular/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { Subject } from "rxjs";

@Injectable({
  providedIn: "root",
})
export class LiveSyncService implements OnDestroy {
  private ngZone = inject(NgZone);
  private unlistenFns: UnlistenFn[] = [];

  constructor() {
    this.initListeners();
  }

  private async initListeners() {
    const collections = ["tasks", "todos", "subtasks", "comments", "categories", "chats"];

    for (const collection of collections) {
      const unlisten = await listen(`db-change-${collection}`, (event: any) => {
        this.ngZone.run(() => {
          this.handleDbChange(collection, event.payload);
        });
      });
      this.unlistenFns.push(unlisten);
    }
  }

  private handleDbChange(collection: string, change: any) {
    const operationType = change.operationType;
    let eventType = "";

    const entityName = this.getEntityName(collection);

    switch (operationType) {
      case "insert":
        eventType = `${entityName}-created`;
        break;
      case "update":
      case "replace":
        eventType = `${entityName}-updated`;
        break;
      case "delete":
        eventType = `${entityName}-deleted`;
        break;
    }

    if (eventType) {
      const data = change.fullDocument || { id: change.documentKey?._id || change.documentKey?.id };

      // Dispatch custom event to maintain compatibility with existing websocket event listeners
      const customEventName = `ws-${eventType}`;
      window.dispatchEvent(new CustomEvent(customEventName, { detail: data }));
    }
  }

  private getEntityName(collection: string): string {
    switch (collection) {
      case "todos":
        return "todo";
      case "tasks":
        return "task";
      case "subtasks":
        return "subtask";
      case "comments":
        return "comment";
      case "categories":
        return "category";
      case "chats":
        return "chat";
      default:
        return collection;
    }
  }

  ngOnDestroy() {
    this.unlistenFns.forEach((fn) => fn());
  }
}
