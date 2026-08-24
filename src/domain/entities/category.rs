//! Category Entity
//!
//! Domain entity representing a category for organizing Todos.
//!
//! # Source
//! Migrated from `src-tauri/src/entities/category.entity.rs`

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Category entity.
///
/// Used to categorize Todos.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CategoryEntity {
    pub id: Option<String>,
    pub title: String,
    pub user_id: String,
    #[serde(default)]
    pub visibility: String,
    #[serde(default)]
    pub created_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub updated_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub deleted_at: Option<DateTime<Utc>>,
}

/// Creation model for CategoryEntity.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryCreateModel {
    pub title: String,
    pub user_id: String,
    pub visibility: Option<String>,
}

impl CategoryEntity {
    pub fn from_create_model(model: CategoryCreateModel) -> Self {
        Self {
            id: None,
            title: model.title,
            user_id: model.user_id,
            visibility: model.visibility.unwrap_or_else(|| "private".to_string()),
            deleted_at: None,
            created_at: None,
            updated_at: None,
        }
    }
}
