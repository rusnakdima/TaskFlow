//! Application Commands Module
//!
//! Command handlers for write operations (Create, Update, Delete).
//!
//! # Architecture
//! Commands orchestrate between domain and infrastructure.
//! They handle:
//! - Input validation
//! - Authorization checks (delegated to domain or infra)
//! - Domain entity creation/update
//! - Infrastructure calls
//!
//! # Naming Convention
//! - `CreateTodo` - creates a todo
//! - `UpdateTodo` - updates a todo
//! - `DeleteTodo` - soft deletes a todo
//! - `ChangeTodoVisibility` - changes visibility

pub mod change_todo_visibility;
pub mod create_todo;
pub mod delete_todo;
pub mod update_todo;

pub mod create_task;
pub mod delete_task;
pub mod update_task;

pub mod create_subtask;
pub mod delete_subtask;
pub mod update_subtask;

pub mod admin_commands;
pub mod auth_commands;
pub mod chat_commands;

// Re-exports
pub use change_todo_visibility::ChangeTodoVisibility;
pub use create_todo::CreateTodo;
pub use delete_todo::DeleteTodo;
pub use update_todo::UpdateTodo;

pub use create_task::CreateTask;
pub use create_task::DeleteTask;
pub use create_task::UpdateTask;

pub use update_task::CreateSubtask;

// =============================================================================
// APPLICATION ERRORS
// =============================================================================

/// Application-level errors.
///
/// These represent failures in the application layer:
/// - Validation failures
/// - Not found
/// - Infrastructure failures
#[derive(Debug, thiserror::Error)]
pub enum ApplicationError {
    #[error("Validation: {0}")]
    Validation(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Infrastructure: {0}")]
    Infrastructure(String),

    #[error("Unauthorized: {0}")]
    Unauthorized(String),

    #[error("Forbidden: {0}")]
    Forbidden(String),
}

impl From<crate::domain::services::DomainError> for ApplicationError {
    fn from(err: crate::domain::services::DomainError) -> Self {
        match err {
            crate::domain::services::DomainError::Validation(s) => ApplicationError::Validation(s),
            crate::domain::services::DomainError::NotFound(s) => ApplicationError::NotFound(s),
            crate::domain::services::DomainError::Serialization(s) => {
                ApplicationError::Infrastructure(s)
            }
            crate::domain::services::DomainError::Invariant(s) => ApplicationError::Validation(s),
            crate::domain::services::DomainError::PermissionDenied(s) => {
                ApplicationError::Forbidden(s)
            }
            crate::domain::services::DomainError::Infrastructure(s) => {
                ApplicationError::Infrastructure(s)
            }
        }
    }
}
