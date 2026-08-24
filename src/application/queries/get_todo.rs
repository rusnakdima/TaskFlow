//! Get Todo Query
//!
//! Query handler for retrieving a single Todo.
//!
//! # Source
//! Corresponds to tauri commands: `get_todo`, `get_todo_permissions`

use crate::domain::entities::todo::TodoEntity;
use crate::domain::services::DomainError;

/// Get a single Todo by ID.
pub struct GetTodo {
    pub id: String,
}

impl GetTodo {
    pub async fn execute(
        &self,
        repository: &impl crate::domain::services::todo_service::TodoService,
    ) -> Result<Option<TodoEntity>, crate::application::commands::ApplicationError> {
        if self.id.is_empty() {
            return Err(crate::application::commands::ApplicationError::Validation(
                "ID is required".to_string(),
            ));
        }

        repository
            .get_by_id(&self.id)
            .await
            .map_err(|e| e.into())
    }
}

/// Get Todo permissions.
pub struct GetTodoPermissions {
    pub id: String,
    pub user_id: String,
}

impl GetTodoPermissions {
    pub async fn execute(
        &self,
        repository: &impl crate::domain::services::todo_service::TodoService,
    ) -> Result<std::collections::HashMap<String, String>, crate::application::commands::ApplicationError>
    {
        if self.id.is_empty() {
            return Err(crate::application::commands::ApplicationError::Validation(
                "ID is required".to_string(),
            ));
        }

        repository
            .get_permissions(&self.id, &self.user_id)
            .await
            .map_err(|e| e.into())
    }
}
