//! Cascade Service Trait
//!
//! Domain service interface for cascade operations.
//!
//! Cascade operations handle cascading changes across related entities
//! (e.g., when a Todo is deleted, all its Tasks are also deleted).

use crate::domain::services::DomainError;

/// Cascade service interface.
///
/// Handles cascading operations when visibility changes or entities are deleted.
#[async_trait::async_trait]
pub trait CascadeService: Send + Sync {
    /// Sync a todo with children when visibility changes.
    async fn sync_todo_with_children(
        &self,
        todo_id: &str,
        source_provider: &str,
        target_provider: &str,
        visibility: &str,
        delete_from_source: bool,
    ) -> Result<(), DomainError>;

    /// Soft delete with cascade.
    async fn soft_delete_cascade(
        &self,
        table: &str,
        id: &str,
        visibility: &str,
    ) -> Result<(), DomainError>;

    /// Hard delete with cascade.
    async fn permanent_delete_cascade(
        &self,
        table: &str,
        id: &str,
        visibility: &str,
    ) -> Result<(), DomainError>;

    /// Restore from archive with cascade.
    async fn restore_cascade(
        &self,
        table: &str,
        id: &str,
        visibility: &str,
    ) -> Result<(), DomainError>;

    /// Sync entity between providers.
    async fn sync_entity(
        &self,
        table: &str,
        id: &str,
        source_provider: &str,
        target_provider: &str,
    ) -> Result<(), DomainError>;
}
