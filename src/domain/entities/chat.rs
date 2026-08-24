//! Chat Entity
//!
//! Domain entity representing a chat message.
//!
//! # Source
//! Migrated from `src-tauri/src/entities/chat.entity.rs`

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Chat message entity.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ChatEntity {
    pub id: Option<String>,
    pub room_id: String,
    pub sender_id: String,
    pub content: String,
    #[serde(default)]
    pub read_by: Vec<String>,
    #[serde(default)]
    pub created_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub updated_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub deleted_at: Option<DateTime<Utc>>,
    // pub sender: Option<UserEntity>,  // Relations resolved in infrastructure
}

/// Creation model for ChatEntity.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatCreateModel {
    pub room_id: String,
    pub sender_id: String,
    pub content: String,
}

impl ChatEntity {
    pub fn from_create_model(model: ChatCreateModel) -> Self {
        let sender = model.sender_id.clone();
        Self {
            id: None,
            room_id: model.room_id,
            sender_id: sender.clone(),
            content: model.content,
            created_at: None,
            updated_at: None,
            deleted_at: None,
            read_by: vec![sender],
        }
    }
}
