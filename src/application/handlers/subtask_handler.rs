//! Subtask KAS Handler
//!
//! Knowledge Action Service handler for Subtask operations.

use crate::application::state::AppState;
use crate::domain::entities::subtask::{SubtaskEntity, SubtaskCreateModel};
use crate::domain::entities::task::TaskStatus;
use crate::infrastructure::externals::dioxus_shared::{dioxus_shared, Response};
use serde::{Deserialize};
use std::sync::Arc;

pub type HandlerResult<T> = Result<Response<T>, String>;

#[derive(Debug, Deserialize)]
pub struct CreateSubtaskData {
    pub task_id: String,
    pub title: String,
    pub description: Option<String>,
    pub priority: Option<String>,
    pub order: i32,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSubtaskData {
    pub title: Option<String>,
    pub description: Option<String>,
    pub priority: Option<String>,
    pub order: Option<i32>,
}

pub struct SubtaskHandler {
    state: Arc<AppState>,
}

impl SubtaskHandler {
    pub fn new(state: Arc<AppState>) -> Self {
        Self { state }
    }

    pub async fn get(&self, id: String) -> HandlerResult<SubtaskEntity> {
        let result = self.state.subtask_service.get_by_id(&id).await;

        match result {
            Ok(Some(subtask)) => Ok(Response::success(subtask, Some("Found"))),
            Ok(None) => Ok(Response::not_found("Subtask")),
            Err(e) => Ok(Response::error(dioxus_shared::response::Status::Error, e.to_string())),
        }
    }

    pub async fn list_by_task(&self, task_id: String) -> HandlerResult<Vec<SubtaskEntity>> {
        let result = self.state.subtask_service.get_by_task(&task_id).await;

        match result {
            Ok(subtasks) => Ok(Response::success(subtasks, Some("Found"))),
            Err(e) => Ok(Response::error(dioxus_shared::response::Status::Error, e.to_string())),
        }
    }

    pub async fn create(&self, data: CreateSubtaskData, user_id: String) -> HandlerResult<SubtaskEntity> {
        if data.title.is_empty() {
            return Ok(Response::error(
                dioxus_shared::response::Status::ValidationError,
                "Title cannot be empty",
            ));
        }

        let model = SubtaskCreateModel {
            task_id: data.task_id,
            user_id,
            title: data.title,
            description: data.description,
            priority: data.priority.unwrap_or_else(|| "medium".to_string()),
            order: data.order,
            start_date: None,
            end_date: None,
        };

        let result = self.state.subtask_service.create(&model).await;

        match result {
            Ok(subtask) => Ok(Response::success(subtask, Some("Created"))),
            Err(e) => Ok(Response::error(dioxus_shared::response::Status::Error, e.to_string())),
        }
    }

    pub async fn update(&self, id: String, data: UpdateSubtaskData) -> HandlerResult<SubtaskEntity> {
        // First get the existing subtask
        let existing = match self.state.subtask_service.get_by_id(&id).await {
            Ok(Some(subtask)) => subtask,
            Ok(None) => return Ok(Response::not_found("Subtask")),
            Err(e) => return Ok(Response::error(dioxus_shared::response::Status::Error, e.to_string())),
        };

        let mut updated_subtask = existing.clone();
        if let Some(title) = data.title {
            updated_subtask.title = title;
        }
        if let Some(description) = data.description {
            updated_subtask.description = description;
        }
        if let Some(priority) = data.priority {
            updated_subtask.priority = priority;
        }
        if let Some(order) = data.order {
            updated_subtask.order = order;
        }

        let result = self.state.subtask_service.update(&updated_subtask).await;

        match result {
            Ok(subtask) => Ok(Response::success(subtask, Some("Updated"))),
            Err(e) => Ok(Response::error(dioxus_shared::response::Status::Error, e.to_string())),
        }
    }

    pub async fn delete(&self, id: String, user_id: String) -> HandlerResult<serde_json::Value> {
        let result = self.state.subtask_service.delete(&id, &user_id).await;

        match result {
            Ok(_) => Ok(Response::success(serde_json::json!({"message": "Deleted"}), Some("Deleted"))),
            Err(e) => Ok(Response::error(dioxus_shared::response::Status::Error, e.to_string())),
        }
    }

    pub async fn update_status(&self, id: String, status: String, user_id: String) -> HandlerResult<serde_json::Value> {
        let task_status = match status.as_str() {
            "pending" => TaskStatus::Pending,
            "completed" => TaskStatus::Completed,
            "skipped" => TaskStatus::Skipped,
            "failed" => TaskStatus::Failed,
            _ => return Ok(Response::error(dioxus_shared::response::Status::ValidationError, "Invalid status")),
        };

        let result = self.state.subtask_service.update_status(&id, task_status, &user_id).await;

        match result {
            Ok(_) => Ok(Response::success(serde_json::json!({"message": "Status updated"}), Some("Updated"))),
            Err(e) => Ok(Response::error(dioxus_shared::response::Status::Error, e.to_string())),
        }
    }
}
