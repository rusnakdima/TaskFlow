//! Domain Entities Module
//!
//! App-specific domain entities for TaskFlow.
//! These are plain data structures with no infrastructure dependencies.
//!
//! # Classification
//! - Cross-app entities (User, Session, AppConfig, EntityRegistry) → dioxus-shared
//! - App-specific entities (Todo, Task, Subtask, etc.) → domain/entities
//!
//! # Migration Source
//! These entities are migrated from `src-tauri/src/entities/` which currently
//! use nosql_orm::Model, Validate, and have soft_delete, timestamp, relations.
//! The new domain entities are plain serde structs.

pub mod auth_forms;
pub mod category;
pub mod chat;
pub mod comment;
pub mod group;
pub mod permission;
pub mod profile;
pub mod room;
pub mod subtask;
pub mod task;
pub mod todo;
pub mod user;

// Re-exports for convenience
pub use auth_forms::{LoginForm, PasswordReset, SignupForm};
pub use category::{CategoryCreateModel, CategoryEntity};
pub use chat::{ChatCreateModel, ChatEntity};
pub use comment::{CommentCreateModel, CommentEntity};
pub use group::{GroupCreateModel, GroupEntity};
pub use permission::{TodoPermission, ASSIGNEE_DEFAULT_ROLE};
pub use profile::{ProfileCreateModel, ProfileEntity};
pub use room::{RoomCreateModel, RoomEntity};
pub use subtask::{SubtaskCreateModel, SubtaskEntity};
pub use task::{TaskCreateModel, TaskEntity, TaskStatus};
pub use todo::{TodoCreateModel, TodoEntity};
pub use user::{UserCreateModel, UserEntity};

// TODO: Migrate from src-tauri/src/entities/:
// - daily_activity.entity.rs → domain/entities/daily_activity.rs
// - statistics.entity.rs → domain/entities/statistics.rs
// - email_config.entity.rs → domain/entities/email_config.rs
// - table.entity.rs → domain/entities/table.rs (if still needed)
// - provider_type.entity.rs → domain/entities/provider_type.rs (if still needed)
