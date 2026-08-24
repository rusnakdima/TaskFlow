//! List Todos Query
//!
//! Query handler for listing Todos.
//!
//! # Source
//! Corresponds to tauri commands: `get_todos`

use crate::domain::entities::todo::TodoEntity;
use crate::domain::services::DomainError;

/// List all Todos for a user.
pub struct ListTodos {
    pub user_id: String,
}

impl ListTodos {
    pub async fn execute(
        &self,
        repository: &impl crate::domain::services::todo_service::TodoService,
    ) -> Result<Vec<TodoEntity>, crate::application::commands::ApplicationError> {
        if self.user_id.is_empty() {
            return Err(crate::application::commands::ApplicationError::Validation(
                "User ID is required".to_string(),
            ));
        }

        repository
            .get_by_user(&self.user_id)
            .await
            .map_err(|e| e.into())
    }
}
