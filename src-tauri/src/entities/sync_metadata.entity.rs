use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncMetadata {
  pub isOwner: bool,
  pub isPrivate: bool,
}
