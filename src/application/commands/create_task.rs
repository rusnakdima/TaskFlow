//! Task Commands
//!
//! Command handlers for Task operations.

use crate::domain::entities::task::{TaskCreateModel, TaskEntity};

// =============================================================================
// Create Task
// =============================================================================

/// Create a new Task.
pub struct CreateTask {
    pub model: TaskCreateModel,
}

impl CreateTask {
    pub async fn execute(
        &self,
        repository: &impl crate::domain::services::task_service::TaskService,
    ) -> Result<TaskEntity, crate::application::commands::ApplicationError> {
        // Validation
        if self.model.title.is_empty() {
            return Err(crate::application::commands::ApplicationError::Validation(
                "Title cannot be empty".to_string(),
            ));
        }

        if self.model.todo_id.is_empty() {
            return Err(crate::application::commands::ApplicationError::Validation(
                "Todo ID is required".to_string(),
            ));
        }

        // Validate priority
        if !["low", "medium", "high", "urgent"].contains(&self.model.priority.as_str()) {
            return Err(crate::application::commands::ApplicationError::Validation(
                "Priority must be low, medium, high, or urgent".to_string(),
            ));
        }

        repository.create(&self.model).await.map_err(|e| e.into())
    }
}

// =============================================================================
// Update Task
// =============================================================================

/// Update an existing Task.
pub struct UpdateTask {
    pub task: TaskEntity,
}

impl UpdateTask {
    pub async fn execute(
        &self,
        repository: &impl crate::domain::services::task_service::TaskService,
    ) -> Result<TaskEntity, crate::application::commands::ApplicationError> {
        if self.task.title.is_empty() {
            return Err(crate::application::commands::ApplicationError::Validation(
                "Title cannot be empty".to_string(),
            ));
        }

        repository.update(&self.task).await.map_err(|e| e.into())
    }
}

// =============================================================================
// Delete Task
// =============================================================================

/// Delete (soft delete) a Task.
pub struct DeleteTask {
    pub id: String,
    pub user_id: String,
}

impl DeleteTask {
    pub async fn execute(
        &self,
        repository: &impl crate::domain::services::task_service::TaskService,
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
