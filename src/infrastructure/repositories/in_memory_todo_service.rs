use std::collections::HashMap;
use std::sync::Arc;

use async_trait::async_trait;
use chrono::Utc;

use crate::domain::entities::todo::{TodoCreateModel, TodoEntity};
use crate::domain::services::todo_service::TodoService;
use crate::domain::services::DomainError;

/// In-memory implementation of TodoService for UI development and testing.
///
/// This implementation is a stub that stores todos in memory.
/// Used during UI development when database connectivity is not needed.
pub struct InMemoryTodoService {
    todos: Arc<tokio::sync::Mutex<Vec<TodoEntity>>>,
    user_id: String,
}

impl Clone for InMemoryTodoService {
    fn clone(&self) -> Self {
        Self {
            todos: self.todos.clone(),
            user_id: self.user_id.clone(),
        }
    }
}

impl PartialEq for InMemoryTodoService {
    fn eq(&self, other: &Self) -> bool {
        self.user_id == other.user_id
    }
}

impl InMemoryTodoService {
    pub fn new(user_id: &str) -> Self {
        Self {
            todos: Arc::new(tokio::sync::Mutex::new(Vec::new())),
            user_id: user_id.to_string(),
        }
    }
}

#[async_trait]
impl TodoService for InMemoryTodoService {
    async fn create(&self, todo: &TodoCreateModel) -> Result<TodoEntity, DomainError> {
        let mut entity = TodoEntity::from_create_model(todo.clone());
        entity.id = Some(uuid::Uuid::new_v4().to_string());
        entity.created_at = Some(Utc::now());
        entity.updated_at = Some(Utc::now());
        entity.user_id = self.user_id.clone();

        let mut todos = self.todos.lock().await;
        todos.push(entity.clone());
        Ok(entity)
    }

    async fn get_by_id(&self, id: &str) -> Result<Option<TodoEntity>, DomainError> {
        let todos = self.todos.lock().await;
        Ok(todos.iter().find(|t| t.id.as_deref() == Some(id)).cloned())
    }

    async fn get_by_user(&self, user_id: &str) -> Result<Vec<TodoEntity>, DomainError> {
        let todos = self.todos.lock().await;
        Ok(todos
            .iter()
            .filter(|t| t.user_id == user_id)
            .cloned()
            .collect())
    }

    async fn update(&self, todo: &TodoEntity) -> Result<TodoEntity, DomainError> {
        let mut todos = self.todos.lock().await;
        if let Some(idx) = todos.iter().position(|t| t.id == todo.id) {
            let mut updated = todo.clone();
            updated.updated_at = Some(Utc::now());
            todos[idx] = updated.clone();
            Ok(updated)
        } else {
            Err(DomainError::NotFound("Todo not found".to_string()))
        }
    }

    async fn delete(&self, id: &str, _user_id: &str) -> Result<(), DomainError> {
        let mut todos = self.todos.lock().await;
        if let Some(idx) = todos.iter().position(|t| t.id.as_deref() == Some(id)) {
            todos[idx].deleted_at = Some(Utc::now());
            Ok(())
        } else {
            Err(DomainError::NotFound("Todo not found".to_string()))
        }
    }

    async fn change_visibility(
        &self,
        id: &str,
        visibility: &str,
        _user_id: &str,
    ) -> Result<(), DomainError> {
        let mut todos = self.todos.lock().await;
        if let Some(todo) = todos.iter_mut().find(|t| t.id.as_deref() == Some(id)) {
            todo.visibility = visibility.to_string();
            todo.updated_at = Some(Utc::now());
            Ok(())
        } else {
            Err(DomainError::NotFound("Todo not found".to_string()))
        }
    }

    async fn update_permissions(
        &self,
        id: &str,
        assignee_roles: HashMap<String, String>,
        _user_id: &str,
    ) -> Result<(), DomainError> {
        let mut todos = self.todos.lock().await;
        if let Some(todo) = todos.iter_mut().find(|t| t.id.as_deref() == Some(id)) {
            todo.assignee_roles = assignee_roles;
            todo.updated_at = Some(Utc::now());
            Ok(())
        } else {
            Err(DomainError::NotFound("Todo not found".to_string()))
        }
    }

    async fn transfer_ownership(
        &self,
        id: &str,
        new_user_id: &str,
        _user_id: &str,
    ) -> Result<(), DomainError> {
        let mut todos = self.todos.lock().await;
        if let Some(todo) = todos.iter_mut().find(|t| t.id.as_deref() == Some(id)) {
            todo.user_id = new_user_id.to_string();
            todo.updated_at = Some(Utc::now());
            Ok(())
        } else {
            Err(DomainError::NotFound("Todo not found".to_string()))
        }
    }

    async fn get_permissions(
        &self,
        id: &str,
        _user_id: &str,
    ) -> Result<HashMap<String, String>, DomainError> {
        let todos = self.todos.lock().await;
        if let Some(todo) = todos.iter().find(|t| t.id.as_deref() == Some(id)) {
            Ok(todo.assignee_roles.clone())
        } else {
            Err(DomainError::NotFound("Todo not found".to_string()))
        }
    }
}
