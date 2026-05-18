/* sys lib */
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/* nosql_orm */
use nosql_orm::Model;

#[derive(Debug, Clone, Serialize, Deserialize, Model)]
#[table_name("notifications")]
#[index("user_id", 1)]
#[index("created_at", -1)]
pub struct NotificationEntity {
  pub id: Option<String>,
  pub user_id: String,
  pub notification_type: String,
  pub action: String,
  pub title: String,
  pub message: String,
  #[serde(default)]
  pub read: bool,
  pub related_id: Option<String>,
  pub related_type: Option<String>,
  pub todo_id: Option<String>,
  pub task_id: Option<String>,
  pub subtask_id: Option<String>,
  pub comment_id: Option<String>,
  pub chat_id: Option<String>,
  pub sender_user_id: Option<String>,
  #[serde(default)]
  pub created_at: Option<DateTime<Utc>>,
  #[serde(default)]
  pub updated_at: Option<DateTime<Utc>>,
}
