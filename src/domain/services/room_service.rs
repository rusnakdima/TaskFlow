//! Room Service Trait
//!
//! Domain service interface for Room operations.

use crate::domain::entities::room::{RoomCreateModel, RoomEntity};
use crate::domain::services::DomainError;

/// Room service interface.
#[async_trait::async_trait]
pub trait RoomService: Send + Sync {
    /// Create a new room.
    async fn create(&self, room: &RoomCreateModel) -> Result<RoomEntity, DomainError>;

    /// Get room by ID.
    async fn get_by_id(&self, id: &str) -> Result<Option<RoomEntity>, DomainError>;

    /// Get all rooms for a user.
    async fn get_by_user(&self, user_id: &str) -> Result<Vec<RoomEntity>, DomainError>;

    /// Update an existing room.
    async fn update(&self, room: &RoomEntity) -> Result<RoomEntity, DomainError>;

    /// Delete a room (soft delete).
    async fn delete(&self, id: &str, user_id: &str) -> Result<(), DomainError>;

    /// Add participant to room.
    async fn add_participant(
        &self,
        id: &str,
        participant_id: &str,
        user_id: &str,
    ) -> Result<(), DomainError>;

    /// Remove participant from room.
    async fn remove_participant(
        &self,
        id: &str,
        participant_id: &str,
        user_id: &str,
    ) -> Result<(), DomainError>;
}
