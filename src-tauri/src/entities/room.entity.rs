/* sys lib */
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
/* nosql_orm */
use nosql_orm::{Model, Validate};
#[derive(Debug, Clone, Serialize, Deserialize, Model)]
#[table_name("rooms")]
#[soft_delete]
#[timestamp]
#[index("room", 1)]
pub struct RoomEntity {
  pub id: Option<String>,
  pub name: Option<String>,
  pub room: String,
  #[serde(default)]
  pub is_group: bool,
  #[one_to_many("participants", "profiles", "user_id", "participant_ids")]
  #[serde(default)]
  pub participant_ids: Vec<String>,
  #[serde(default)]
  pub created_at: Option<DateTime<Utc>>,
  #[serde(default)]
  pub updated_at: Option<DateTime<Utc>>,
  #[serde(default)]
  pub deleted_at: Option<DateTime<Utc>>,
}
#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
pub struct RoomCreateModel {
  pub name: Option<String>,
  #[validate(required)]
  pub room: String,
  #[serde(default)]
  pub is_group: bool,
  #[serde(default)]
  pub participant_ids: Vec<String>,
}
impl From<RoomCreateModel> for RoomEntity {
  fn from(create: RoomCreateModel) -> Self {
    RoomEntity {
      id: None,
      name: create.name,
      room: create.room,
      is_group: create.is_group,
      participant_ids: create.participant_ids,
      created_at: None,
      updated_at: None,
      deleted_at: None,
    }
  }
}
