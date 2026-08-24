//! Infrastructure Module
//!
//! Infrastructure layer implementations.
//!
//! # Architecture
//! This layer contains:
//! - Repository implementations (implements domain service traits)
//! - External service bridges (calls to dioxus_shared)
//! - Concrete implementations of domain interfaces
//!
//! # Key Rule
//! Infrastructure calls `dioxus_shared` services HERE, NOT in domain layer.
//! Domain layer has no knowledge of dioxus_shared.
//!
//! # Structure
//! ```
//! infrastructure/
//! ├── mod.rs                    # This file - re-exports
//! ├── repositories/
//! │   ├── mod.rs
//! │   ├── todo_repository.rs    # Implements TodoService trait
//! │   ├── task_repository.rs   # Implements TaskService trait
//! │   └── ...
//! ├── services/
//! │   ├── mod.rs
//! │   ├── auth_infra.rs        # Auth implementation
//! │   ├── cascade_infra.rs     # Cascade implementation
//! │   └── ...
//! └── externals/
//!     ├── mod.rs
//!     └── dioxus_shared.rs     # Bridge to dioxus_shared
//! ```

pub mod externals;
pub mod repositories;
pub mod services;

pub use repositories::category_repository::CategoryRepository;
pub use repositories::group_repository::GroupRepository;
pub use repositories::in_memory_todo_service::InMemoryTodoService;
pub use repositories::room_repository::RoomRepository;
pub use repositories::subtask_repository::SubtaskRepository;
pub use repositories::task_repository::TaskRepository;
pub use repositories::todo_repository::TodoRepository;

// =============================================================================
// INFRASTRUCTURE ERRORS
// =============================================================================

/// Infrastructure-level errors.
///
/// These represent failures in the infrastructure layer:
/// - Database errors
/// - External service failures
#[derive(Debug, thiserror::Error)]
pub enum InfrastructureError {
    #[error("Database error: {0}")]
    Database(String),

    #[error("External service error: {0}")]
    External(String),

    #[error("Serialization error: {0}")]
    Serialization(String),
}
