//! Comment Entity
//!
//! Domain entity representing a comment on a Task or Subtask.
//!
//! # Source
//! Migrated from `src-tauri/src/entities/comment.entity.rs`

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Comment entity.
///
/// Can belong to either a Task or a Subtask (xor relationship).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CommentEntity {
    pub id: Option<String>,
    pub user_id: String,
    pub content: String,
    #[serde(default)]
    pub task_id: Option<String>,
    #[serde(default)]
    pub subtask_id: Option<String>,
    #[serde(default)]
    pub read_by: Vec<String>,
    #[serde(default)]
    pub created_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub updated_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub deleted_at: Option<DateTime<Utc>>,
}

/// Creation model for CommentEntity.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommentCreateModel {
    pub user_id: String,
    pub content: String,
    pub task_id: Option<String>,
    pub subtask_id: Option<String>,
}

impl CommentEntity {
    pub fn from_create_model(model: CommentCreateModel) -> Self {
        Self {
            id: None,
            user_id: model.user_id,
            content: model.content,
            created_at: None,
            updated_at: None,
            task_id: model.task_id,
            subtask_id: model.subtask_id,
            read_by: vec![],
            deleted_at: None,
        }
    }
}
