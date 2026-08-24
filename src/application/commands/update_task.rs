//! Create Subtask Command
//!
//! Handler for creating a new Subtask.

use crate::domain::entities::subtask::{SubtaskCreateModel, SubtaskEntity};

/// Create a new Subtask.
pub struct CreateSubtask {
    pub model: SubtaskCreateModel,
}

impl CreateSubtask {
    pub async fn execute(
        &self,
        _repository: &impl crate::domain::services::task_service::TaskService,
        // TODO: Add subtask service when available
    ) -> Result<SubtaskEntity, crate::application::commands::ApplicationError> {
        // Validation
        if self.model.title.is_empty() {
            return Err(crate::application::commands::ApplicationError::Validation(
                "Title cannot be empty".to_string(),
            ));
        }

        if self.model.task_id.is_empty() {
            return Err(crate::application::commands::ApplicationError::Validation(
                "Task ID is required".to_string(),
            ));
        }

        Err(
            crate::application::commands::ApplicationError::Infrastructure(
                "Subtask creation not yet implemented - SubtaskService integration pending"
                    .to_string(),
            ),
        )
    }
}

// TODO: Add UpdateSubtask, DeleteSubtask commands
