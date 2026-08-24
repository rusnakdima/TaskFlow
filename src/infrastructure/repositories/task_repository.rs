use crate::domain::entities::task::{TaskCreateModel, TaskEntity, TaskStatus};
use crate::domain::services::task_service::TaskService;
use crate::domain::services::DomainError;
use crate::infrastructure::externals::dioxus_shared::BaseCrudService;
use std::sync::Arc;

pub struct TaskRepository {
    base_crud: Arc<BaseCrudService>,
}

impl TaskRepository {
    pub fn new(base_crud: Arc<BaseCrudService>) -> Self {
        Self { base_crud }
    }
}

#[async_trait::async_trait]
impl TaskService for TaskRepository {
    async fn create(&self, task: &TaskCreateModel) -> Result<TaskEntity, DomainError> {
        let data =
            serde_json::to_value(task).map_err(|e| DomainError::Serialization(e.to_string()))?;

        self.base_crud
            .create("tasks", data)
            .await
            .map_err(DomainError::Infrastructure)?;

        Ok(TaskEntity::from_create_model(task.clone()))
    }

    async fn get_by_id(&self, id: &str) -> Result<Option<TaskEntity>, DomainError> {
        let result = self
            .base_crud
            .get("tasks", id)
            .await
            .map_err(DomainError::Infrastructure)?;

        match result.data {
            Some(data) => {
                let task = serde_json::from_value::<TaskEntity>(data)
                    .map_err(|e| DomainError::Serialization(e.to_string()))?;
                Ok(Some(task))
            }
            None => Ok(None),
        }
    }

    async fn get_by_todo(&self, todo_id: &str) -> Result<Vec<TaskEntity>, DomainError> {
        let result = self
            .base_crud
            .get_all("tasks")
            .await
            .map_err(DomainError::Infrastructure)?;

        let tasks: Vec<TaskEntity> = serde_json::from_value(
            result
                .data
                .ok_or_else(|| DomainError::Serialization("No data".into()))?,
        )
        .map_err(|e| DomainError::Serialization(e.to_string()))?;

        let filtered: Vec<TaskEntity> =
            tasks.into_iter().filter(|t| t.todo_id == todo_id).collect();

        Ok(filtered)
    }

    async fn update(&self, task: &TaskEntity) -> Result<TaskEntity, DomainError> {
        let id = task
            .id
            .as_ref()
            .ok_or_else(|| DomainError::Validation("Task ID is required for update".to_string()))?;

        let data =
            serde_json::to_value(task).map_err(|e| DomainError::Serialization(e.to_string()))?;

        self.base_crud
            .update("tasks", id, data)
            .await
            .map_err(DomainError::Infrastructure)?;

        Ok(task.clone())
    }

    async fn delete(&self, id: &str, _user_id: &str) -> Result<(), DomainError> {
        self.base_crud
            .delete("tasks", id)
            .await
            .map_err(DomainError::Infrastructure)?;

        Ok(())
    }

    async fn update_status(
        &self,
        id: &str,
        status: &TaskStatus,
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
            .update("tasks", id, update_data)
            .await
            .map_err(DomainError::Infrastructure)?;

        Ok(())
    }
}
