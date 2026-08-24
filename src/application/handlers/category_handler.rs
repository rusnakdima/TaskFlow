//! Category KAS Handler
//!
//! Knowledge Action Service handler for Category operations.

use crate::application::state::AppState;
use crate::domain::entities::category::{CategoryEntity, CategoryCreateModel};
use crate::infrastructure::externals::dioxus_shared::{dioxus_shared, Response};
use serde::{Deserialize};
use std::sync::Arc;

pub type HandlerResult<T> = Result<Response<T>, String>;

#[derive(Debug, Deserialize)]
pub struct CreateCategoryData {
    pub title: String,
    pub visibility: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateCategoryData {
    pub title: Option<String>,
    pub visibility: Option<String>,
}

pub struct CategoryHandler {
    state: Arc<AppState>,
}

impl CategoryHandler {
    pub fn new(state: Arc<AppState>) -> Self {
        Self { state }
    }

    pub async fn get(&self, id: String) -> HandlerResult<CategoryEntity> {
        let result = self.state.category_service.get_by_id(&id).await;

        match result {
            Ok(Some(category)) => Ok(Response::success(category, Some("Found"))),
            Ok(None) => Ok(Response::not_found("Category")),
            Err(e) => Ok(Response::error(dioxus_shared::response::Status::Error, e.to_string())),
        }
    }

    pub async fn list_by_user(&self, user_id: String) -> HandlerResult<Vec<CategoryEntity>> {
        let result = self.state.category_service.get_by_user(&user_id).await;

        match result {
            Ok(categories) => Ok(Response::success(categories, Some("Found"))),
            Err(e) => Ok(Response::error(dioxus_shared::response::Status::Error, e.to_string())),
        }
    }

    pub async fn create(&self, data: CreateCategoryData, user_id: String) -> HandlerResult<CategoryEntity> {
        if data.title.is_empty() {
            return Ok(Response::error(
                dioxus_shared::response::Status::ValidationError,
                "Category name cannot be empty",
            ));
        }

        let model = CategoryCreateModel {
            title: data.title,
            user_id,
            visibility: data.visibility,
        };

        let result = self.state.category_service.create(&model).await;

        match result {
            Ok(category) => Ok(Response::success(category, Some("Created"))),
            Err(e) => Ok(Response::error(dioxus_shared::response::Status::Error, e.to_string())),
        }
    }

    pub async fn update(&self, id: String, data: UpdateCategoryData) -> HandlerResult<CategoryEntity> {
        // First get the existing category
        let existing = match self.state.category_service.get_by_id(&id).await {
            Ok(Some(category)) => category,
            Ok(None) => return Ok(Response::not_found("Category")),
            Err(e) => return Ok(Response::error(dioxus_shared::response::Status::Error, e.to_string())),
        };

        let mut updated_category = existing.clone();
        if let Some(title) = data.title {
            updated_category.title = title;
        }
        if let Some(visibility) = data.visibility {
            updated_category.visibility = visibility;
        }

        let result = self.state.category_service.update(&updated_category).await;

        match result {
            Ok(category) => Ok(Response::success(category, Some("Updated"))),
            Err(e) => Ok(Response::error(dioxus_shared::response::Status::Error, e.to_string())),
        }
    }

    pub async fn delete(&self, id: String, user_id: String) -> HandlerResult<serde_json::Value> {
        let result = self.state.category_service.delete(&id, &user_id).await;

        match result {
            Ok(_) => Ok(Response::success(serde_json::json!({"message": "Deleted"}), Some("Deleted"))),
            Err(e) => Ok(Response::error(dioxus_shared::response::Status::Error, e.to_string())),
        }
    }
}
