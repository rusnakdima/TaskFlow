//! Update Todo Command
//!
//! Handler for updating an existing Todo.

use crate::domain::entities::todo::TodoEntity;

/// Update an existing Todo.
pub struct UpdateTodo {
    pub todo: TodoEntity,
}

impl UpdateTodo {
    pub async fn execute(
        &self,
        repository: &impl crate::domain::services::todo_service::TodoService,
    ) -> Result<TodoEntity, crate::application::commands::ApplicationError> {
        // Validation
        if self.todo.title.is_empty() {
            return Err(crate::application::commands::ApplicationError::Validation(
                "Title cannot be empty".to_string(),
            ));
        }

        repository.update(&self.todo).await.map_err(|e| e.into())
    }
}
