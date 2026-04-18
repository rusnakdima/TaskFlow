use crate::entities::response_entity::ResponseModel;

use super::cascade_ids::CascadeIds;

/// CascadeProvider - Trait defining cascade operations for different storage providers
/// This trait allows uniform handling of cascade delete/restore operations
/// regardless of the underlying storage mechanism (JSON or MongoDB)
#[allow(dead_code)]
pub trait CascadeProvider {
  /// Delete an entity and all its children with cascade
  ///
  /// # Arguments
  /// * `table` - The table/collection name (e.g., "todos", "tasks")
  /// * `id` - The ID of the entity to delete
  ///
  /// # Returns
  /// * `Result<CascadeIds, ResponseModel>` - IDs of all cascaded entities on success
  async fn deleteWithCascade(&self, table: &str, id: &str) -> Result<CascadeIds, ResponseModel>;

  /// Archive/Restore an entity and all its children with cascade
  ///
  /// # Arguments
  /// * `table` - The table/collection name (e.g., "todos", "tasks")
  /// * `id` - The ID of the entity to archive/restore
  /// * `isRestore` - If true, restore the entity; if false, archive it
  ///
  /// # Returns
  /// * `Result<CascadeIds, ResponseModel>` - IDs of all cascaded entities on success
  async fn archiveWithCascade(
    &self,
    table: &str,
    id: &str,
    isRestore: bool,
  ) -> Result<CascadeIds, ResponseModel>;
}
