//! Category Service Trait
//!
//! Domain service interface for Category operations.

use crate::domain::entities::category::{CategoryCreateModel, CategoryEntity};
use crate::domain::services::DomainError;

/// Category service interface.
#[async_trait::async_trait]
pub trait CategoryService: Send + Sync {
    /// Create a new category.
    async fn create(&self, category: &CategoryCreateModel) -> Result<CategoryEntity, DomainError>;

    /// Get category by ID.
    async fn get_by_id(&self, id: &str) -> Result<Option<CategoryEntity>, DomainError>;

    /// Get all categories for a user.
    async fn get_by_user(&self, user_id: &str) -> Result<Vec<CategoryEntity>, DomainError>;

    /// Update an existing category.
    async fn update(&self, category: &CategoryEntity) -> Result<CategoryEntity, DomainError>;

    /// Delete a category (soft delete).
    async fn delete(&self, id: &str, user_id: &str) -> Result<(), DomainError>;
}
