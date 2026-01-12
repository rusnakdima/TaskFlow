use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub struct SyncMetadata {
  pub isOwner: bool,
  pub isPrivate: bool,
}
