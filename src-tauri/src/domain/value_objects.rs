use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, TS)]
pub struct TaskId(pub String);

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, TS)]
pub struct ProjectId(pub String);
