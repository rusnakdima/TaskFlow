//! Domain Services Module
//!
//! Domain service interfaces/traits.
//!
//! These define the contract between application layer and infrastructure.
//! Infrastructure implements these traits.
//!
//! # Architecture
//! - Domain services are traits (interfaces)
//! - NO implementations in this layer
//! - Implementations go in `infrastructure/`
//!
//! # Naming Convention
//! - Trait names: `TodoService`, `TaskService`, etc.
//! - Methods use async and return `Result<T, DomainError>`

pub mod auth_service;
pub mod cascade_service;
pub mod category_service;
pub mod group_service;
pub mod room_service;
pub mod subtask_service;
pub mod task_service;
pub mod todo_service;

pub use auth_service::AuthService;
pub use cascade_service::CascadeService;
pub use category_service::CategoryService;
pub use group_service::GroupService;
pub use room_service::RoomService;
pub use subtask_service::SubtaskService;
pub use task_service::TaskService;
pub use todo_service::TodoService;

// TODO: Add more service traits based on TaskFlow commands:
// - ChatService
// - NotificationService
// - StatisticsService

// =============================================================================
// DOMAIN ERRORS
// =============================================================================

/// Domain-level errors.
///
/// These represent business logic failures:
/// - Validation errors
/// - Entity not found
/// - Invariant violations
/// - Serialization errors
#[derive(Debug, thiserror::Error)]
pub enum DomainError {
    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Entity not found: {0}")]
    NotFound(String),

    #[error("Serialization error: {0}")]
    Serialization(String),

    #[error("Business invariant violated: {0}")]
    Invariant(String),

    #[error("Permission denied: {0}")]
    PermissionDenied(String),

    #[error("Infrastructure error: {0}")]
    Infrastructure(String),
}
