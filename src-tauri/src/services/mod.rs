#[path = "crud.service.rs"]
pub mod crud_service;

#[path = "manage_db.service.rs"]
pub mod manage_db_service;

#[path = "websocket_server.service.rs"]
pub mod websocket_server_service;

#[path = "live_sync.service.rs"]
pub mod live_sync_service;

// Special services (not CRUD)
pub mod auth;

#[path = "auth.service.rs"]
pub mod auth_service;

#[path = "profile.service.rs"]
pub mod profile_service;

#[path = "profile_sync.service.rs"]
pub mod profile_sync_service;

#[path = "about.service.rs"]
pub mod about_service;

// Refactored from crud.service.rs
#[path = "cascade.service.rs"]
pub mod cascade_service;

#[path = "entity_resolution.service.rs"]
pub mod entity_resolution_service;

#[path = "activity_monitor.service.rs"]
pub mod activity_monitor_service;

// Managers (split from manage_db.service.rs)
#[path = "sync.service.rs"]
pub mod sync_manager;

#[path = "export.service.rs"]
pub mod export_manager;

pub mod admin;

#[path = "admin.service.rs"]
pub mod admin_manager;

pub mod statistics;

#[path = "statistics.service.rs"]
pub mod statistics_service;
