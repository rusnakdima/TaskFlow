//! Group Entity
//!
//! Domain entity representing a group of users.
//!
//! # Source
//! Migrated from `src-tauri/src/entities/group.entity.rs`

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Group entity.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GroupEntity {
    pub id: Option<String>,
    pub name: String,
    pub avatar: Option<String>,
    pub room_id: String,
    pub owner_id: String,
    #[serde(default)]
    pub member_ids: Vec<String>,
    #[serde(default)]
    pub created_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub updated_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub deleted_at: Option<DateTime<Utc>>,
}

/// Creation model for GroupEntity.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupCreateModel {
    pub name: String,
    pub avatar: Option<String>,
    pub room_id: String,
    pub owner_id: String,
    #[serde(default)]
    pub member_ids: Vec<String>,
}

impl GroupEntity {
    pub fn from_create_model(model: GroupCreateModel) -> Self {
        Self {
            id: None,
            name: model.name,
            avatar: model.avatar,
            room_id: model.room_id,
            owner_id: model.owner_id,
            member_ids: model.member_ids,
            created_at: None,
            updated_at: None,
            deleted_at: None,
        }
    }
}
