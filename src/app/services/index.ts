/**
 * Main Services Barrel File
 * Re-exports all services from subfolders for backward compatibility
 */

// Core services
export {
  StorageService,
  AdminStorageService,
  LiveSyncService,
  WebSocketDispatcherService,
  LocalWebSocketService,
  ConflictDetectionService,
  OfflineQueueService,
} from "./core";

// Auth services
export { AuthService, JwtTokenService } from "./auth";

// Data services
export { DataSyncService, SyncService, AdminService } from "./data";

// Features services
export {
  TemplateService,
  TodosBlueprintService,
  AboutService,
} from "./features";

// Notifications services
export { NotificationService } from "./notifications";

// UI services
export {
  DragDropOrderService,
  ShortcutService,
  KanbanDragDropService,
} from "./ui";
