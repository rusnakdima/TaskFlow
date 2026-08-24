//! Profile Entity
//!
//! Domain entity representing a user's profile.
//!
//! # Source
//! Migrated from `src-tauri/src/entities/profile.entity.rs`

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Profile entity.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProfileEntity {
    pub id: Option<String>,
    pub name: String,
    pub last_name: String,
    pub bio: String,
    pub image_url: String,
    pub original_image_url: String,
    pub user_id: String,
    #[serde(default)]
    pub created_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub updated_at: Option<DateTime<Utc>>,
}

/// Creation model for ProfileEntity.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileCreateModel {
    pub name: Option<String>,
    pub last_name: Option<String>,
    pub bio: Option<String>,
    pub image_url: Option<String>,
    pub original_image_url: Option<String>,
    pub user_id: String,
}

impl ProfileEntity {
    pub fn from_create_model(model: ProfileCreateModel) -> Self {
        Self {
            id: None,
            name: model.name.unwrap_or_default(),
            last_name: model.last_name.unwrap_or_default(),
            bio: model.bio.unwrap_or_default(),
            image_url: model.image_url.unwrap_or_default(),
            original_image_url: model.original_image_url.unwrap_or_default(),
            user_id: model.user_id,
            created_at: None,
            updated_at: None,
        }
    }
}
