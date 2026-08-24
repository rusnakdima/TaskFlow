//! Todo Service Trait
//!
//! Domain service interface for Todo operations.
//!
//! Implemented by infrastructure layer.

use crate::domain::entities::todo::{TodoCreateModel, TodoEntity};
use crate::domain::services::DomainError;

/// Todo service interface.
///
/// Defines operations on Todo entities.
/// Implementation provided by infrastructure layer.
#[async_trait::async_trait]
pub trait TodoService: Send + Sync {
    /// Create a new todo.
    async fn create(&self, todo: &TodoCreateModel) -> Result<TodoEntity, DomainError>;

    /// Get todo by ID.
    async fn get_by_id(&self, id: &str) -> Result<Option<TodoEntity>, DomainError>;

    /// Get all todos for a user.
    async fn get_by_user(&self, user_id: &str) -> Result<Vec<TodoEntity>, DomainError>;

    /// Update an existing todo.
    async fn update(&self, todo: &TodoEntity) -> Result<TodoEntity, DomainError>;

    /// Delete a todo (soft delete).
    async fn delete(&self, id: &str, user_id: &str) -> Result<(), DomainError>;

    /// Change todo visibility.
    async fn change_visibility(
        &self,
        id: &str,
        visibility: &str,
        user_id: &str,
    ) -> Result<(), DomainError>;

    /// Update todo permissions (assignee roles).
    async fn update_permissions(
        &self,
        id: &str,
        assignee_roles: std::collections::HashMap<String, String>,
        user_id: &str,
    ) -> Result<(), DomainError>;

    /// Transfer todo ownership to another user.
    async fn transfer_ownership(
        &self,
        id: &str,
        new_user_id: &str,
        user_id: &str,
    ) -> Result<(), DomainError>;

    /// Get todo permissions.
    async fn get_permissions(
        &self,
        id: &str,
        user_id: &str,
    ) -> Result<std::collections::HashMap<String, String>, DomainError>;

    // TODO: Add more methods based on TaskFlow commands:
    // - get_by_visibility
    // - search
    // - archive
    // - restore
}
