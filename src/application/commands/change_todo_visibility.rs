//! Change Todo Visibility Command
//!
//! Handler for changing Todo visibility (private/shared).
//!
//! # Source
//! From `todo.command.rs:change_todo_visibility`

/// Change Todo visibility.
pub struct ChangeTodoVisibility {
    pub id: String,
    pub new_visibility: String,
    pub user_id: String,
}

impl ChangeTodoVisibility {
    pub async fn execute(
        &self,
        repository: &impl crate::domain::services::todo_service::TodoService,
        _cascade_service: &impl crate::domain::services::cascade_service::CascadeService,
    ) -> Result<(), crate::application::commands::ApplicationError> {
        // Validate visibility
        if self.new_visibility != "private" && self.new_visibility != "shared" {
            return Err(crate::application::commands::ApplicationError::Validation(
                "Visibility must be 'private' or 'shared'".to_string(),
            ));
        }

        // Get existing todo to check old visibility
        let existing = repository
            .get_by_id(&self.id)
            .await
            .map_err(crate::application::commands::ApplicationError::from)?
            .ok_or_else(|| {
                crate::application::commands::ApplicationError::NotFound(
                    "Todo not found".to_string(),
                )
            })?;

        // If unchanged, return early
        if existing.visibility == self.new_visibility {
            return Ok(()); // No-op
        }

        // Change visibility
        repository
            .change_visibility(&self.id, &self.new_visibility, &self.user_id)
            .await
            .map_err(crate::application::commands::ApplicationError::from)?;

        // If visibility changed, trigger cascade sync
        // (this is infrastructure-level cascade, not domain)
        // Note: Cascade logic may need to be moved to infrastructure

        Ok(())
    }
}
