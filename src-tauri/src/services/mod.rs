#[path = "repository.service.rs"]
pub mod repository_service;

#[path = "manage_db.service.rs"]
pub mod manage_db_service;

// WebSocket server - now modularized
pub mod websocket;

#[path = "live_sync.service.rs"]
pub mod live_sync_service;

// Special services (not CRUD)
pub mod auth;

#[path = "auth.service.rs"]
pub mod auth_service;

#[path = "profile.service.rs"]
pub mod profile_service;

#[path = "about.service.rs"]
pub mod about_service;

// Refactored from crud.service.rs - now modularized
pub mod cascade;

#[path = "entity_resolution.service.rs"]
pub mod entity_resolution_service;

#[path = "activity_monitor.service.rs"]
pub mod activity_monitor_service;

// Admin operations (note: admin/ directory removed - unused)
#[path = "admin.service.rs"]
pub mod admin_manager;

pub mod statistics;

#[path = "statistics.service.rs"]
pub mod statistics_service;

#[path = "crypto.service.rs"]
pub mod crypto_service;
