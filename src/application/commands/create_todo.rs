//! Create Todo Command
//!
//! Handler for creating a new Todo.
//!
//! # Source
//! Corresponds to tauri commands: `create_todo` (from `crud_route!` macro)
//! and `todo.command.rs` additional operations.
//!
//! # Flow
//! 1. Validate input
//! 2. Create domain entity
//! 3. Call infrastructure (repository) to persist

use crate::domain::entities::todo::{TodoCreateModel, TodoEntity};

/// Create a new Todo.
pub struct CreateTodo {
    pub model: TodoCreateModel,
}

impl CreateTodo {
    /// Execute the command.
    ///
    /// # Errors
    /// Returns `ApplicationError` if validation fails or infrastructure errors.
    pub async fn execute(
        &self,
        repository: &impl crate::domain::services::todo_service::TodoService,
    ) -> Result<TodoEntity, crate::application::commands::ApplicationError> {
        // Validation
        if self.model.title.is_empty() {
            return Err(crate::application::commands::ApplicationError::Validation(
                "Title cannot be empty".to_string(),
            ));
        }

        if self.model.user_id.is_empty() {
            return Err(crate::application::commands::ApplicationError::Validation(
                "User ID is required".to_string(),
            ));
        }

        // Validate visibility
        if self.model.visibility != "private" && self.model.visibility != "shared" {
            return Err(crate::application::commands::ApplicationError::Validation(
                "Visibility must be 'private' or 'shared'".to_string(),
            ));
        }

        // Validate priority
        if !["low", "medium", "high", "urgent"].contains(&self.model.priority.as_str()) {
            return Err(crate::application::commands::ApplicationError::Validation(
                "Priority must be low, medium, high, or urgent".to_string(),
            ));
        }

        // Create domain entity
        let _todo = TodoEntity::from_create_model(self.model.clone());

        // Persist via domain service (infrastructure)
        repository
            .create(&self.model.clone())
            .await
            .map_err(|e| e.into())
    }
}

// TODO: Implement remaining commands based on tauri commands:
// - UpdateTodo
// - DeleteTodo
// - ChangeTodoVisibility
// - etc.
