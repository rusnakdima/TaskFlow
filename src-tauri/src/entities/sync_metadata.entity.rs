use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct SyncMetadata {
  pub is_owner: bool,
  pub is_private: bool,
}
