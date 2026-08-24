//! Task Service Trait
//!
//! Domain service interface for Task operations.

use crate::domain::entities::task::{TaskCreateModel, TaskEntity};
use crate::domain::services::DomainError;

/// Task service interface.
#[async_trait::async_trait]
pub trait TaskService: Send + Sync {
    /// Create a new task.
    async fn create(&self, task: &TaskCreateModel) -> Result<TaskEntity, DomainError>;

    /// Get task by ID.
    async fn get_by_id(&self, id: &str) -> Result<Option<TaskEntity>, DomainError>;

    /// Get all tasks for a todo.
    async fn get_by_todo(&self, todo_id: &str) -> Result<Vec<TaskEntity>, DomainError>;

    /// Update an existing task.
    async fn update(&self, task: &TaskEntity) -> Result<TaskEntity, DomainError>;

    /// Delete a task (soft delete).
    async fn delete(&self, id: &str, user_id: &str) -> Result<(), DomainError>;

    /// Update task status.
    async fn update_status(
        &self,
        id: &str,
        status: &crate::domain::entities::task::TaskStatus,
        user_id: &str,
    ) -> Result<(), DomainError>;

    // TODO: Add more methods
    // - get_by_user
    // - search
    // - get_by_date_range
}
