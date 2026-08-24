use crate::domain::entities::category::{CategoryCreateModel, CategoryEntity};
use crate::domain::services::category_service::CategoryService;
use crate::domain::services::DomainError;
use crate::infrastructure::externals::dioxus_shared::BaseCrudService;
use std::sync::Arc;

pub struct CategoryRepository {
    base_crud: Arc<BaseCrudService>,
}

impl CategoryRepository {
    pub fn new(base_crud: Arc<BaseCrudService>) -> Self {
        Self { base_crud }
    }
}

#[async_trait::async_trait]
impl CategoryService for CategoryRepository {
    async fn create(&self, category: &CategoryCreateModel) -> Result<CategoryEntity, DomainError> {
        let data = serde_json::to_value(category)
            .map_err(|e| DomainError::Serialization(e.to_string()))?;

        self.base_crud
            .create("categories", data)
            .await
            .map_err(DomainError::Infrastructure)?;

        Ok(CategoryEntity::from_create_model(category.clone()))
    }

    async fn get_by_id(&self, id: &str) -> Result<Option<CategoryEntity>, DomainError> {
        let result = self
            .base_crud
            .get("categories", id)
            .await
            .map_err(DomainError::Infrastructure)?;

        match result.data {
            Some(data) => {
                let category = serde_json::from_value::<CategoryEntity>(data)
                    .map_err(|e| DomainError::Serialization(e.to_string()))?;
                Ok(Some(category))
            }
            None => Ok(None),
        }
    }

    async fn get_by_user(&self, user_id: &str) -> Result<Vec<CategoryEntity>, DomainError> {
        let result = self
            .base_crud
            .get_all("categories")
            .await
            .map_err(DomainError::Infrastructure)?;

        let categories: Vec<CategoryEntity> = serde_json::from_value(
            result
                .data
                .ok_or_else(|| DomainError::Serialization("No data".into()))?,
        )
        .map_err(|e| DomainError::Serialization(e.to_string()))?;

        let filtered: Vec<CategoryEntity> = categories
            .into_iter()
            .filter(|c| c.user_id == user_id)
            .collect();

        Ok(filtered)
    }

    async fn update(&self, category: &CategoryEntity) -> Result<CategoryEntity, DomainError> {
        let id = category.id.as_ref().ok_or_else(|| {
            DomainError::Validation("Category ID is required for update".to_string())
        })?;

        let data = serde_json::to_value(category)
            .map_err(|e| DomainError::Serialization(e.to_string()))?;

        self.base_crud
            .update("categories", id, data)
            .await
            .map_err(DomainError::Infrastructure)?;

        Ok(category.clone())
    }

    async fn delete(&self, id: &str, _user_id: &str) -> Result<(), DomainError> {
        self.base_crud
            .delete("categories", id)
            .await
            .map_err(DomainError::Infrastructure)?;

        Ok(())
    }
}
