use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ProfileCreateRequest {
  pub name: Option<String>,
  pub last_name: Option<String>,
  pub bio: Option<String>,
  pub image_url: Option<String>,
  pub user_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ProfileUpdateRequest {
  pub name: Option<String>,
  pub last_name: Option<String>,
  pub bio: Option<String>,
  pub image_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ChatCreateRequest {
  pub user_id: String,
  pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ChatUpdateRequest {
  pub content: Option<String>,
  pub read_by: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct CategoryCreateRequest {
  pub title: String,
  pub user_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct CategoryUpdateRequest {
  pub title: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct CommentCreateRequest {
  pub user_id: String,
  pub content: String,
  pub task_id: Option<String>,
  pub subtask_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct SubtaskCreateRequest {
  pub task_id: String,
  pub title: String,
  pub description: Option<String>,
  pub priority: String,
  pub order: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct SubtaskUpdateRequest {
  pub title: Option<String>,
  pub description: Option<String>,
  pub status: Option<String>,
  pub priority: Option<String>,
  pub order: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct TaskCreateRequest {
  pub todo_id: String,
  pub title: String,
  pub description: Option<String>,
  pub priority: String,
  pub start_date: Option<String>,
  pub end_date: Option<String>,
  pub order: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct TaskUpdateRequest {
  pub title: Option<String>,
  pub description: Option<String>,
  pub status: Option<String>,
  pub priority: Option<String>,
  pub order: Option<i32>,
  pub start_date: Option<String>,
  pub end_date: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct TodoCreateRequest {
  pub user_id: String,
  pub title: String,
  pub description: Option<String>,
  pub start_date: Option<String>,
  pub end_date: Option<String>,
  pub categories: Vec<String>,
  pub assignees: Vec<String>,
  pub visibility: String,
  pub priority: String,
  pub github_repo_id: Option<String>,
  pub github_repo_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct TodoUpdateRequest {
  pub title: Option<String>,
  pub description: Option<String>,
  pub start_date: Option<String>,
  pub end_date: Option<String>,
  pub categories: Option<Vec<String>>,
  pub assignees: Option<Vec<String>>,
  pub visibility: Option<String>,
  pub priority: Option<String>,
  pub order: Option<i32>,
  pub github_repo_id: Option<String>,
  pub github_repo_name: Option<String>,
}
