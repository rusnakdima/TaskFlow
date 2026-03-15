/// Struct to hold all collected cascade IDs
#[derive(Default, serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct CascadeIds {
  pub task_ids: Vec<String>,
  pub subtask_ids: Vec<String>,
  pub comment_ids: Vec<String>,
  pub chat_ids: Vec<String>,
}

impl CascadeIds {
  pub fn new() -> Self {
    Self::default()
  }

  pub fn is_empty(&self) -> bool {
    self.task_ids.is_empty()
      && self.subtask_ids.is_empty()
      && self.comment_ids.is_empty()
      && self.chat_ids.is_empty()
  }

  pub fn total_count(&self) -> usize {
    self.task_ids.len() + self.subtask_ids.len() + self.comment_ids.len() + self.chat_ids.len()
  }
}
