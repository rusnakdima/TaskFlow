/* sys lib */
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/* nosql_orm */
use nosql_orm::{Model, Validate};

#[derive(Debug, Clone, Serialize, Deserialize, Model)]
#[table_name("groups")]
#[soft_delete]
#[timestamp]
#[index("owner_id", 1)]
#[index("room_id", 1)]
#[allow(dead_code)]
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

#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
#[allow(dead_code)]
pub struct GroupCreateModel {
  #[validate(required)]
  pub name: String,
  pub avatar: Option<String>,
  #[validate(required)]
  pub room_id: String,
  #[validate(required)]
  pub owner_id: String,
  #[serde(default)]
  pub member_ids: Vec<String>,
}

impl From<GroupCreateModel> for GroupEntity {
  fn from(create: GroupCreateModel) -> Self {
    GroupEntity {
      id: None,
      name: create.name,
      avatar: create.avatar,
      room_id: create.room_id,
      owner_id: create.owner_id,
      member_ids: create.member_ids,
      created_at: None,
      updated_at: None,
      deleted_at: None,
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct GroupUpdateModel {
  pub name: Option<String>,
  pub avatar: Option<String>,
  pub add_member_ids: Option<Vec<String>>,
  pub remove_member_ids: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct GroupAddMemberModel {
  pub member_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct GroupRemoveMemberModel {
  pub member_ids: Vec<String>,
}
