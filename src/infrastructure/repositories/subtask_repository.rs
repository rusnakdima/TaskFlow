use crate::domain::entities::subtask::{SubtaskCreateModel, SubtaskEntity};
use crate::domain::entities::task::TaskStatus;
use crate::domain::services::subtask_service::SubtaskService;
use crate::domain::services::DomainError;
use crate::infrastructure::externals::dioxus_shared::BaseCrudService;
use std::sync::Arc;

pub struct SubtaskRepository {
    base_crud: Arc<BaseCrudService>,
}

impl SubtaskRepository {
    pub fn new(base_crud: Arc<BaseCrudService>) -> Self {
        Self { base_crud }
    }
}

#[async_trait::async_trait]
impl SubtaskService for SubtaskRepository {
    async fn create(&self, subtask: &SubtaskCreateModel) -> Result<SubtaskEntity, DomainError> {
        let data =
            serde_json::to_value(subtask).map_err(|e| DomainError::Serialization(e.to_string()))?;

        self.base_crud
            .create("subtasks", data)
            .await
            .map_err(DomainError::Infrastructure)?;

        Ok(SubtaskEntity::from_create_model(subtask.clone()))
    }

    async fn get_by_id(&self, id: &str) -> Result<Option<SubtaskEntity>, DomainError> {
        let result = self
            .base_crud
            .get("subtasks", id)
            .await
            .map_err(DomainError::Infrastructure)?;

        match result.data {
            Some(data) => {
                let subtask = serde_json::from_value::<SubtaskEntity>(data)
                    .map_err(|e| DomainError::Serialization(e.to_string()))?;
                Ok(Some(subtask))
            }
            None => Ok(None),
        }
    }

    async fn get_by_task(&self, task_id: &str) -> Result<Vec<SubtaskEntity>, DomainError> {
        let result = self
            .base_crud
            .get_all("subtasks")
            .await
            .map_err(DomainError::Infrastructure)?;

        let subtasks: Vec<SubtaskEntity> = serde_json::from_value(
            result
                .data
                .ok_or_else(|| DomainError::Serialization("No data".into()))?,
        )
        .map_err(|e| DomainError::Serialization(e.to_string()))?;

        let filtered: Vec<SubtaskEntity> = subtasks
            .into_iter()
            .filter(|s| s.task_id == task_id)
            .collect();

        Ok(filtered)
    }

    async fn update(&self, subtask: &SubtaskEntity) -> Result<SubtaskEntity, DomainError> {
        let id = subtask.id.as_ref().ok_or_else(|| {
            DomainError::Validation("Subtask ID is required for update".to_string())
        })?;

        let data =
            serde_json::to_value(subtask).map_err(|e| DomainError::Serialization(e.to_string()))?;

        self.base_crud
            .update("subtasks", id, data)
            .await
            .map_err(DomainError::Infrastructure)?;

        Ok(subtask.clone())
    }

    async fn delete(&self, id: &str, _user_id: &str) -> Result<(), DomainError> {
        self.base_crud
            .delete("subtasks", id)
            .await
            .map_err(DomainError::Infrastructure)?;

        Ok(())
    }

    async fn update_status(
        &self,
        id: &str,
        status: TaskStatus,
        _user_id: &str,
    ) -> Result<(), DomainError> {
        let status_str = match status {
            TaskStatus::Pending => "pending",
            TaskStatus::Completed => "completed",
            TaskStatus::Skipped => "skipped",
            TaskStatus::Failed => "failed",
        };

        let update_data = serde_json::json!({ "status": status_str });

        self.base_crud
            .update("subtasks", id, update_data)
            .await
            .map_err(DomainError::Infrastructure)?;

        Ok(())
    }
}
