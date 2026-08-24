//! Room Entity
//!
//! Domain entity representing a chat room.
//!
//! # Source
//! Migrated from `src-tauri/src/entities/room.entity.rs`

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Room entity (chat room).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RoomEntity {
    pub id: Option<String>,
    pub name: Option<String>,
    pub room: String, // The actual room identifier
    #[serde(default)]
    pub is_group: bool,
    #[serde(default)]
    pub participant_ids: Vec<String>,
    #[serde(default)]
    pub created_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub updated_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub deleted_at: Option<DateTime<Utc>>,
}

/// Creation model for RoomEntity.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoomCreateModel {
    pub name: Option<String>,
    pub room: String,
    #[serde(default)]
    pub is_group: bool,
    #[serde(default)]
    pub participant_ids: Vec<String>,
}

impl RoomEntity {
    pub fn from_create_model(model: RoomCreateModel) -> Self {
        Self {
            id: None,
            name: model.name,
            room: model.room,
            is_group: model.is_group,
            participant_ids: model.participant_ids,
            created_at: None,
            updated_at: None,
            deleted_at: None,
        }
    }
}
