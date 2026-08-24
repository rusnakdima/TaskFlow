//! Task Entity
//!
//! Domain entity representing a task within a Todo.
//!
//! # Source
//! Migrated from `src-tauri/src/entities/task.entity.rs`
//!
//! # Domain Model
//! - Task belongs to a Todo (one-to-many relationship)
//! - Task contains subtasks and comments
//! - Task status: pending, completed, skipped, failed
//!
//! # Notes
//! - TaskStatus enum moved to this file as a value object
//! - nosql_orm relations removed
//! - Validation moved to application layer

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Task status enumeration.
///
/// Value object - equality by value, not identity.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum TaskStatus {
    #[default]
    Pending,
    Completed,
    Skipped,
    Failed,
}

/// Task entity.
///
/// Belongs to a Todo and contains subtasks and comments.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TaskEntity {
    pub id: Option<String>,
    pub todo_id: String,
    pub user_id: String,
    pub title: String,
    pub description: String,
    pub status: TaskStatus,
    pub priority: String, // "low" | "medium" | "high" | "urgent"
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub order: i32,
    pub subtasks_count: i32,
    pub completed_subtasks_count: i32,
    pub comments_count: i32,
    #[serde(default)]
    pub created_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub updated_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub deleted_at: Option<DateTime<Utc>>,
}

/// Creation model for TaskEntity.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskCreateModel {
    pub todo_id: String,
    pub user_id: String,
    pub title: String,
    pub description: Option<String>,
    pub priority: String,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub order: i32,
}

impl TaskEntity {
    /// Create a new TaskEntity from a creation model.
    pub fn from_create_model(model: TaskCreateModel) -> Self {
        Self {
            id: None,
            todo_id: model.todo_id,
            user_id: model.user_id,
            title: model.title,
            description: model.description.unwrap_or_default(),
            status: TaskStatus::Pending,
            priority: model.priority,
            start_date: model.start_date,
            end_date: model.end_date,
            order: model.order,
            subtasks_count: 0,
            completed_subtasks_count: 0,
            comments_count: 0,
            deleted_at: None,
            created_at: None,
            updated_at: None,
        }
    }
}

// TODO: Add domain-specific methods
// Example: pub fn is_complete(&self) -> bool { matches!(self.status, TaskStatus::Completed) }
// Example: pub fn completion_percentage(&self) -> f32 { ... }
