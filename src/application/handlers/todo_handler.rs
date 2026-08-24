//! Todo KAS Handler
//!
//! Knowledge Action Service handler for Todo operations.
//!
//! # CR-001 Fix
//! This handler uses the CORRECT Response::success(data, Some(message)) signature.
//! The original Tauri code had `Response::success(data)` which caused issues.

use crate::application::state::AppState;
use crate::domain::entities::todo::{TodoEntity, TodoCreateModel};
use crate::infrastructure::externals::dioxus_shared::{dioxus_shared, Response};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

/// Response type for handler operations
pub type HandlerResult<T> = Result<Response<T>, String>;

/// Query parameters for listing todos
#[derive(Debug, Deserialize)]
pub struct ListTodosQuery {
    pub user_id: Option<String>,
    pub visibility: Option<String>,
    pub page: Option<u64>,
    pub limit: Option<u64>,
}

/// Query parameters for getting a single todo
#[derive(Debug, Deserialize)]
pub struct GetTodoQuery {
    pub user_id: Option<String>,
}

/// Data for creating a todo
#[derive(Debug, Deserialize)]
pub struct CreateTodoData {
    pub title: String,
    pub description: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub categories: Vec<String>,
    pub assignees: Vec<String>,
    pub visibility: String,
    pub priority: String,
    pub order: i32,
    pub github_repo_id: Option<String>,
    pub github_repo_name: Option<String>,
}

/// Data for updating a todo
#[derive(Debug, Deserialize)]
pub struct UpdateTodoData {
    pub title: Option<String>,
    pub description: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub categories: Option<Vec<String>>,
    pub assignees: Option<Vec<String>>,
    pub visibility: Option<String>,
    pub priority: Option<String>,
    pub order: Option<i32>,
}

/// Data for changing visibility
#[derive(Debug, Deserialize)]
pub struct ChangeVisibilityData {
    pub todo_id: String,
    pub new_visibility: String,
}

/// Data for updating permissions
#[derive(Debug, Deserialize)]
pub struct UpdatePermissionsData {
    pub todo_id: String,
    pub assignee_roles: std::collections::HashMap<String, String>,
}

/// KAS Handler for Todo operations
pub struct TodoHandler {
    state: Arc<AppState>,
}

impl TodoHandler {
    pub fn new(state: Arc<AppState>) -> Self {
        Self { state }
    }

    /// Get a single todo by ID
    pub async fn get(&self, id: String, query: GetTodoQuery) -> HandlerResult<TodoEntity> {
        let result = self.state.todo_service.get_by_id(&id).await;

        match result {
            Ok(Some(todo)) => Ok(Response::success(todo, Some("Found"))),
            Ok(None) => Ok(Response::not_found("Todo")),
            Err(e) => Ok(Response::error(dioxus_shared::response::Status::Error, e.to_string())),
        }
    }

    /// List todos with optional filtering
    pub async fn list(&self, query: ListTodosQuery) -> HandlerResult<Vec<TodoEntity>> {
        // If user_id is provided, use get_by_user
        let todos = if let Some(user_id) = &query.user_id {
            self.state.todo_service.get_by_user(user_id).await
        } else {
            // Get all todos (this would need a different service method)
            // For now, return empty list as fallback
            Ok(vec![])
        };

        let mut todos = match todos {
            Ok(todos) => todos,
            Err(e) => return Ok(Response::error(dioxus_shared::response::Status::Error, e.to_string())),
        };

        // Filter by visibility if provided
        if let Some(visibility) = &query.visibility {
            todos.retain(|t| t.visibility == *visibility);
        }

        // Filter out deleted todos
        todos.retain(|t| t.deleted_at.is_none());

        Ok(Response::success(todos, Some("Found")))
    }

    /// Create a new todo
    pub async fn create(&self, data: CreateTodoData, user_id: String) -> HandlerResult<TodoEntity> {
        // Validate required fields
        if data.title.is_empty() {
            return Ok(Response::error(
                dioxus_shared::response::Status::ValidationError,
                "Title cannot be empty",
            ));
        }

        let model = TodoCreateModel {
            user_id,
            title: data.title,
            description: data.description,
            start_date: data.start_date,
            end_date: data.end_date,
            categories: data.categories,
            assignees: data.assignees,
            assignee_roles: None,
            visibility: data.visibility,
            priority: data.priority,
            order: data.order,
            github_repo_id: data.github_repo_id,
            github_repo_name: data.github_repo_name,
        };

        let result = self.state.todo_service.create(&model).await;

        match result {
            Ok(todo) => Ok(Response::success(todo, Some("Created"))),
            Err(e) => Ok(Response::error(dioxus_shared::response::Status::Error, e.to_string())),
        }
    }

    /// Update an existing todo
    pub async fn update(&self, id: String, data: UpdateTodoData) -> HandlerResult<TodoEntity> {
        // First get the existing todo
        let existing = match self.state.todo_service.get_by_id(&id).await {
            Ok(Some(todo)) => todo,
            Ok(None) => return Ok(Response::not_found("Todo")),
            Err(e) => return Ok(Response::error(dioxus_shared::response::Status::Error, e.to_string())),
        };

        // Apply updates
        let mut updated_todo = existing.clone();
        if let Some(title) = data.title {
            updated_todo.title = title;
        }
        if let Some(description) = data.description {
            updated_todo.description = Some(description);
        }
        if let Some(start_date) = data.start_date {
            updated_todo.start_date = Some(start_date);
        }
        if let Some(end_date) = data.end_date {
            updated_todo.end_date = Some(end_date);
        }
        if let Some(categories) = data.categories {
            updated_todo.categories = categories;
        }
        if let Some(assignees) = data.assignees {
            updated_todo.assignees = assignees;
        }
        if let Some(visibility) = data.visibility {
            updated_todo.visibility = visibility;
        }
        if let Some(priority) = data.priority {
            updated_todo.priority = priority;
        }
        if let Some(order) = data.order {
            updated_todo.order = order;
        }

        let result = self.state.todo_service.update(&updated_todo).await;

        match result {
            Ok(todo) => Ok(Response::success(todo, Some("Updated"))),
            Err(e) => Ok(Response::error(dioxus_shared::response::Status::Error, e.to_string())),
        }
    }

    /// Delete a todo (soft delete)
    pub async fn delete(&self, id: String, user_id: String) -> HandlerResult<serde_json::Value> {
        let result = self.state.todo_service.delete(&id, &user_id).await;

        match result {
            Ok(_) => Ok(Response::success(serde_json::json!({"message": "Deleted"}), Some("Deleted"))),
            Err(e) => Ok(Response::error(dioxus_shared::response::Status::Error, e.to_string())),
        }
    }

    /// Change todo visibility
    pub async fn change_visibility(&self, data: ChangeVisibilityData) -> HandlerResult<serde_json::Value> {
        let result = self.state.todo_service.change_visibility(&data.todo_id, &data.new_visibility, "").await;

        match result {
            Ok(_) => Ok(Response::success(
                serde_json::json!({"message": "Visibility changed successfully"}),
                Some("Updated")
            )),
            Err(e) => Ok(Response::error(dioxus_shared::response::Status::Error, e.to_string())),
        }
    }

    /// Update todo permissions
    pub async fn update_permissions(&self, data: UpdatePermissionsData) -> HandlerResult<serde_json::Value> {
        let result = self.state.todo_service.update_permissions(&data.todo_id, data.assignee_roles, "").await;

        match result {
            Ok(_) => Ok(Response::success(
                serde_json::json!({"message": "Permissions updated"}),
                Some("Updated")
            )),
            Err(e) => Ok(Response::error(dioxus_shared::response::Status::Error, e.to_string())),
        }
    }

    /// Transfer todo ownership
    pub async fn transfer_ownership(&self, todo_id: String, new_user_id: String) -> HandlerResult<serde_json::Value> {
        let result = self.state.todo_service.transfer_ownership(&todo_id, &new_user_id, "").await;

        match result {
            Ok(_) => Ok(Response::success(
                serde_json::json!({"message": "Ownership transferred"}),
                Some("Updated")
            )),
            Err(e) => Ok(Response::error(dioxus_shared::response::Status::Error, e.to_string())),
        }
    }
}
