#[path = "crud_service.rs"]
pub mod crud_service;

#[path = "manage_db.service.rs"]
pub mod manage_db_service;

#[path = "websocket_server.service.rs"]
pub mod websocket_server_service;

// Special services (not CRUD)
#[path = "auth.service.rs"]
pub mod auth_service;

#[path = "profile.service.rs"]
pub mod profile_service;

#[path = "profile_sync.service.rs"]
pub mod profile_sync_service;

#[path = "about.service.rs"]
pub mod about_service;

// Managers (split from manage_db.service.rs)
#[path = "sync_manager.rs"]
pub mod sync_manager;

#[path = "export_manager.rs"]
pub mod export_manager;

#[path = "admin_manager.rs"]
pub mod admin_manager;

#[path = "statistics.service.rs"]
pub mod statistics_service;
