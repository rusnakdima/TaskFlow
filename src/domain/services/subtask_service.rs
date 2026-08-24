//! Subtask Service Trait
//!
//! Domain service interface for Subtask operations.

use crate::domain::entities::subtask::{SubtaskCreateModel, SubtaskEntity};
use crate::domain::entities::task::TaskStatus;
use crate::domain::services::DomainError;

/// Subtask service interface.
#[async_trait::async_trait]
pub trait SubtaskService: Send + Sync {
    /// Create a new subtask.
    async fn create(&self, subtask: &SubtaskCreateModel) -> Result<SubtaskEntity, DomainError>;

    /// Get subtask by ID.
    async fn get_by_id(&self, id: &str) -> Result<Option<SubtaskEntity>, DomainError>;

    /// Get all subtasks for a task.
    async fn get_by_task(&self, task_id: &str) -> Result<Vec<SubtaskEntity>, DomainError>;

    /// Update an existing subtask.
    async fn update(&self, subtask: &SubtaskEntity) -> Result<SubtaskEntity, DomainError>;

    /// Delete a subtask (soft delete).
    async fn delete(&self, id: &str, user_id: &str) -> Result<(), DomainError>;

    /// Update subtask status.
    async fn update_status(
        &self,
        id: &str,
        status: TaskStatus,
        user_id: &str,
    ) -> Result<(), DomainError>;
}
