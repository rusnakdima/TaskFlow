//! Todo Entity
//!
//! Domain entity representing a TaskFlow todo/project.
//!
//! # Source
//! Migrated from `src-tauri/src/entities/todo.entity.rs`
//!
//! # Domain Model
//! - Todo is an aggregate root containing tasks
//! - Visibility controls private/shared storage
//! - Assignee roles control permissions per user
//!
//! # Notes
//! - nosql_orm relations removed (handled by infrastructure)
//! - Validation moved to application layer
//! - Soft delete via `deleted_at` timestamp

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Todo aggregate root.
///
/// Plain data structure - no business logic methods.
/// Serialization for storage, TypeScript for frontend.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TodoEntity {
    pub id: Option<String>,
    pub user_id: String,
    pub title: String,
    pub description: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub categories: Vec<String>,
    pub assignees: Vec<String>,
    pub assignee_roles: HashMap<String, String>,
    pub visibility: String, // "private" | "shared"
    pub priority: String,   // "low" | "medium" | "high" | "urgent"
    pub order: i32,
    pub github_repo_id: Option<String>,
    pub github_repo_name: Option<String>,
    pub tasks_count: i32,
    pub completed_tasks_count: i32,
    #[serde(default)]
    pub created_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub updated_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub deleted_at: Option<DateTime<Utc>>,
}

/// Creation model for TodoEntity.
///
/// Used in application layer for input validation.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TodoCreateModel {
    pub user_id: String,
    pub title: String,
    pub description: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub categories: Vec<String>,
    pub assignees: Vec<String>,
    pub assignee_roles: Option<HashMap<String, String>>,
    pub visibility: String,
    pub priority: String,
    pub order: i32,
    pub github_repo_id: Option<String>,
    pub github_repo_name: Option<String>,
}

impl TodoEntity {
    /// Create a new TodoEntity from a creation model.
    ///
    /// Note: In domain layer, no validation or ID generation.
    /// These are handled by application layer.
    pub fn from_create_model(model: TodoCreateModel) -> Self {
        Self {
            id: None,
            user_id: model.user_id,
            title: model.title,
            description: model.description,
            start_date: model.start_date,
            end_date: model.end_date,
            categories: model.categories,
            assignees: model.assignees,
            assignee_roles: model.assignee_roles.unwrap_or_default(),
            visibility: model.visibility,
            priority: model.priority,
            order: model.order,
            github_repo_id: model.github_repo_id,
            github_repo_name: model.github_repo_name,
            tasks_count: 0,
            completed_tasks_count: 0,
            deleted_at: None,
            created_at: None,
            updated_at: None,
        }
    }
}

// TODO: Add domain-specific methods here (not infrastructure calls)
// Example: pub fn is_overdue(&self) -> bool { ... }
// Example: pub fn completion_percentage(&self) -> f32 { ... }
