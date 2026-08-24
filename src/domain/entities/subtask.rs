//! Subtask Entity
//!
//! Domain entity representing a subtask within a Task.
//!
//! # Source
//! Migrated from `src-tauri/src/entities/subtask.entity.rs`

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use super::task::TaskStatus;

/// Subtask entity.
///
/// Belongs to a Task and can have comments.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SubtaskEntity {
    pub id: Option<String>,
    pub task_id: String,
    pub user_id: String,
    pub title: String,
    pub description: String,
    pub status: TaskStatus,
    pub priority: String, // "low" | "medium" | "high" | "urgent"
    pub order: i32,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub comments_count: i32,
    #[serde(default)]
    pub created_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub updated_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub deleted_at: Option<DateTime<Utc>>,
}

/// Creation model for SubtaskEntity.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubtaskCreateModel {
    pub task_id: String,
    pub user_id: String,
    pub title: String,
    pub description: Option<String>,
    pub priority: String,
    pub order: i32,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
}

impl SubtaskEntity {
    pub fn from_create_model(model: SubtaskCreateModel) -> Self {
        Self {
            id: None,
            task_id: model.task_id,
            user_id: model.user_id,
            title: model.title,
            description: model.description.unwrap_or_default(),
            status: TaskStatus::Pending,
            priority: model.priority,
            order: model.order,
            comments_count: 0,
            deleted_at: None,
            created_at: None,
            updated_at: None,
            start_date: model.start_date,
            end_date: model.end_date,
        }
    }
}
