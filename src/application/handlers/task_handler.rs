//! Task KAS Handler
//!
//! Knowledge Action Service handler for Task operations.

use crate::application::state::AppState;
use crate::domain::entities::task::{TaskEntity, TaskCreateModel, TaskStatus};
use crate::infrastructure::externals::dioxus_shared::{dioxus_shared, Response};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

pub type HandlerResult<T> = Result<Response<T>, String>;

#[derive(Debug, Deserialize)]
pub struct CreateTaskData {
    pub todo_id: String,
    pub title: String,
    pub description: Option<String>,
    pub status: String,
    pub priority: Option<String>,
    pub order: i32,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTaskData {
    pub title: Option<String>,
    pub description: Option<String>,
    pub status: Option<String>,
    pub priority: Option<String>,
    pub order: Option<i32>,
}

pub struct TaskHandler {
    state: Arc<AppState>,
}

impl TaskHandler {
    pub fn new(state: Arc<AppState>) -> Self {
        Self { state }
    }

    pub async fn get(&self, id: String) -> HandlerResult<TaskEntity> {
        let result = self.state.task_service.get_by_id(&id).await;

        match result {
            Ok(Some(task)) => Ok(Response::success(task, Some("Found"))),
            Ok(None) => Ok(Response::not_found("Task")),
            Err(e) => Ok(Response::error(dioxus_shared::response::Status::Error, e.to_string())),
        }
    }

    pub async fn list_by_todo(&self, todo_id: String) -> HandlerResult<Vec<TaskEntity>> {
        let result = self.state.task_service.get_by_todo(&todo_id).await;

        match result {
            Ok(tasks) => Ok(Response::success(tasks, Some("Found"))),
            Err(e) => Ok(Response::error(dioxus_shared::response::Status::Error, e.to_string())),
        }
    }

    pub async fn create(&self, data: CreateTaskData, user_id: String) -> HandlerResult<TaskEntity> {
        if data.title.is_empty() {
            return Ok(Response::error(
                dioxus_shared::response::Status::ValidationError,
                "Title cannot be empty",
            ));
        }

        let model = TaskCreateModel {
            user_id,
            todo_id: data.todo_id,
            title: data.title,
            description: data.description,
            status: data.status,
            priority: data.priority.unwrap_or_else(|| "medium".to_string()),
            order: data.order,
        };

        let result = self.state.task_service.create(&model).await;

        match result {
            Ok(task) => Ok(Response::success(task, Some("Created"))),
            Err(e) => Ok(Response::error(dioxus_shared::response::Status::Error, e.to_string())),
        }
    }

    pub async fn update(&self, id: String, data: UpdateTaskData) -> HandlerResult<TaskEntity> {
        // First get the existing task
        let existing = match self.state.task_service.get_by_id(&id).await {
            Ok(Some(task)) => task,
            Ok(None) => return Ok(Response::not_found("Task")),
            Err(e) => return Ok(Response::error(dioxus_shared::response::Status::Error, e.to_string())),
        };

        let mut updated_task = existing.clone();
        if let Some(title) = data.title {
            updated_task.title = title;
        }
        if let Some(description) = data.description {
            updated_task.description = Some(description);
        }
        if let Some(status) = data.status {
            updated_task.status = status;
        }
        if let Some(priority) = data.priority {
            updated_task.priority = priority;
        }
        if let Some(order) = data.order {
            updated_task.order = order;
        }

        let result = self.state.task_service.update(&updated_task).await;

        match result {
            Ok(task) => Ok(Response::success(task, Some("Updated"))),
            Err(e) => Ok(Response::error(dioxus_shared::response::Status::Error, e.to_string())),
        }
    }

    pub async fn delete(&self, id: String, user_id: String) -> HandlerResult<serde_json::Value> {
        let result = self.state.task_service.delete(&id, &user_id).await;

        match result {
            Ok(_) => Ok(Response::success(serde_json::json!({"message": "Deleted"}), Some("Deleted"))),
            Err(e) => Ok(Response::error(dioxus_shared::response::Status::Error, e.to_string())),
        }
    }
}
