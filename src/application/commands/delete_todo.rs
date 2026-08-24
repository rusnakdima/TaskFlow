//! Delete Todo Command
//!
//! Handler for soft-deleting a Todo.

/// Delete (soft delete) a Todo.
pub struct DeleteTodo {
    pub id: String,
    pub user_id: String,
}

impl DeleteTodo {
    pub async fn execute(
        &self,
        repository: &impl crate::domain::services::todo_service::TodoService,
    ) -> Result<(), crate::application::commands::ApplicationError> {
        if self.id.is_empty() {
            return Err(crate::application::commands::ApplicationError::Validation(
                "ID is required".to_string(),
            ));
        }

        repository
            .delete(&self.id, &self.user_id)
            .await
            .map_err(|e| e.into())
    }
}
