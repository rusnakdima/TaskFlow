use crate::domain::entities::todo::{TodoCreateModel, TodoEntity};
use crate::domain::services::todo_service::TodoService;
use crate::domain::services::DomainError;
use crate::infrastructure::externals::dioxus_shared::BaseCrudService;
use std::collections::HashMap;
use std::sync::Arc;

pub struct TodoRepository {
    base_crud: Arc<BaseCrudService>,
}

impl TodoRepository {
    pub fn new(base_crud: Arc<BaseCrudService>) -> Self {
        Self { base_crud }
    }
}

#[async_trait::async_trait]
impl TodoService for TodoRepository {
    async fn create(&self, todo: &TodoCreateModel) -> Result<TodoEntity, DomainError> {
        let data =
            serde_json::to_value(todo).map_err(|e| DomainError::Serialization(e.to_string()))?;

        self.base_crud
            .create("todos", data)
            .await
            .map_err(DomainError::Infrastructure)?;

        Ok(TodoEntity::from_create_model(todo.clone()))
    }

    async fn get_by_id(&self, id: &str) -> Result<Option<TodoEntity>, DomainError> {
        let result = self
            .base_crud
            .get("todos", id)
            .await
            .map_err(DomainError::Infrastructure)?;

        match result.data {
            Some(data) => {
                let todo = serde_json::from_value::<TodoEntity>(data)
                    .map_err(|e| DomainError::Serialization(e.to_string()))?;
                Ok(Some(todo))
            }
            None => Ok(None),
        }
    }

    async fn get_by_user(&self, user_id: &str) -> Result<Vec<TodoEntity>, DomainError> {
        let result = self
            .base_crud
            .get_all("todos")
            .await
            .map_err(DomainError::Infrastructure)?;

        let todos: Vec<TodoEntity> = serde_json::from_value(
            result
                .data
                .ok_or_else(|| DomainError::Serialization("No data".into()))?,
        )
        .map_err(|e| DomainError::Serialization(e.to_string()))?;

        let filtered: Vec<TodoEntity> =
            todos.into_iter().filter(|t| t.user_id == user_id).collect();

        Ok(filtered)
    }

    async fn update(&self, todo: &TodoEntity) -> Result<TodoEntity, DomainError> {
        let id = todo
            .id
            .as_ref()
            .ok_or_else(|| DomainError::Validation("Todo ID is required for update".to_string()))?;

        let data =
            serde_json::to_value(todo).map_err(|e| DomainError::Serialization(e.to_string()))?;

        self.base_crud
            .update("todos", id, data)
            .await
            .map_err(DomainError::Infrastructure)?;

        Ok(todo.clone())
    }

    async fn delete(&self, id: &str, _user_id: &str) -> Result<(), DomainError> {
        self.base_crud
            .delete("todos", id)
            .await
            .map_err(DomainError::Infrastructure)?;

        Ok(())
    }

    async fn change_visibility(
        &self,
        id: &str,
        visibility: &str,
        _user_id: &str,
    ) -> Result<(), DomainError> {
        let update_data = serde_json::json!({ "visibility": visibility });

        self.base_crud
            .update("todos", id, update_data)
            .await
            .map_err(DomainError::Infrastructure)?;

        Ok(())
    }

    async fn update_permissions(
        &self,
        id: &str,
        assignee_roles: HashMap<String, String>,
        _user_id: &str,
    ) -> Result<(), DomainError> {
        let update_data = serde_json::json!({ "assignee_roles": assignee_roles });

        self.base_crud
            .update("todos", id, update_data)
            .await
            .map_err(DomainError::Infrastructure)?;

        Ok(())
    }

    async fn transfer_ownership(
        &self,
        id: &str,
        new_user_id: &str,
        _user_id: &str,
    ) -> Result<(), DomainError> {
        let update_data = serde_json::json!({ "user_id": new_user_id });

        self.base_crud
            .update("todos", id, update_data)
            .await
            .map_err(DomainError::Infrastructure)?;

        Ok(())
    }

    async fn get_permissions(
        &self,
        id: &str,
        _user_id: &str,
    ) -> Result<HashMap<String, String>, DomainError> {
        let result = self
            .base_crud
            .get("todos", id)
            .await
            .map_err(DomainError::Infrastructure)?;

        let doc = result
            .data
            .ok_or_else(|| DomainError::NotFound("Todo".to_string()))?;
        let assignee_roles: HashMap<String, String> = doc
            .get("assignee_roles")
            .and_then(|v| v.as_object())
            .map(|obj| {
                obj.iter()
                    .map(|(k, v)| (k.clone(), v.as_str().unwrap_or("viewer").to_string()))
                    .collect()
            })
            .unwrap_or_default();

        Ok(assignee_roles)
    }
}
