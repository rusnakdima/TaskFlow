pub mod repository;

#[path = "manage_db.service.rs"]
pub mod manage_db_service;

#[path = "permission.service.rs"]
pub mod permission_service;

#[path = "todo.service.rs"]
pub mod todo_service;

#[path = "task.service.rs"]
pub mod task_service;

#[path = "subtask.service.rs"]
pub mod subtask_service;

#[path = "comment.service.rs"]
pub mod comment_service;

#[path = "category.service.rs"]
pub mod category_service;

#[path = "chat.service.rs"]
pub mod chat_service;

#[path = "group.service.rs"]
pub mod group_service;

#[path = "room.service.rs"]
pub mod room_service;

#[path = "db_backup.service.rs"]
pub mod db_backup;

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

pub mod profile;
pub mod user;

#[path = "statistics.service.rs"]
pub mod statistics_service;

#[path = "github.service.rs"]
pub mod github_service;

#[path = "base_crud.service.rs"]
pub mod base_crud_service;
