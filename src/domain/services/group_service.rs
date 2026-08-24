//! Group Service Trait
//!
//! Domain service interface for Group operations.

use crate::domain::entities::group::{GroupCreateModel, GroupEntity};
use crate::domain::services::DomainError;

/// Group service interface.
#[async_trait::async_trait]
pub trait GroupService: Send + Sync {
    /// Create a new group.
    async fn create(&self, group: &GroupCreateModel) -> Result<GroupEntity, DomainError>;

    /// Get group by ID.
    async fn get_by_id(&self, id: &str) -> Result<Option<GroupEntity>, DomainError>;

    /// Get all groups for a room.
    async fn get_by_room(&self, room_id: &str) -> Result<Vec<GroupEntity>, DomainError>;

    /// Update an existing group.
    async fn update(&self, group: &GroupEntity) -> Result<GroupEntity, DomainError>;

    /// Delete a group (soft delete).
    async fn delete(&self, id: &str, user_id: &str) -> Result<(), DomainError>;

    /// Add member to group.
    async fn add_member(&self, id: &str, member_id: &str, user_id: &str)
        -> Result<(), DomainError>;

    /// Remove member from group.
    async fn remove_member(
        &self,
        id: &str,
        member_id: &str,
        user_id: &str,
    ) -> Result<(), DomainError>;
}
