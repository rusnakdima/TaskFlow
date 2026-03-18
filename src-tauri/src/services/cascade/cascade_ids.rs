/// Struct to hold all collected cascade IDs
#[derive(Default, serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct CascadeIds {
  pub taskIds: Vec<String>,
  pub subtaskIds: Vec<String>,
  pub commentIds: Vec<String>,
  pub chatIds: Vec<String>,
}

impl CascadeIds {
  pub fn new() -> Self {
    Self::default()
  }

  pub fn isEmpty(&self) -> bool {
    self.taskIds.is_empty()
      && self.subtaskIds.is_empty()
      && self.commentIds.is_empty()
      && self.chatIds.is_empty()
  }

  pub fn totalCount(&self) -> usize {
    self.taskIds.len() + self.subtaskIds.len() + self.commentIds.len() + self.chatIds.len()
  }

  /// Add id only if not already present (M-1: no duplicate IDs in cascade batch)
  pub fn addTaskId(&mut self, id: String) {
    if !self.taskIds.contains(&id) {
      self.taskIds.push(id);
    }
  }

  pub fn addSubtaskId(&mut self, id: String) {
    if !self.subtaskIds.contains(&id) {
      self.subtaskIds.push(id);
    }
  }

  pub fn addCommentId(&mut self, id: String) {
    if !self.commentIds.contains(&id) {
      self.commentIds.push(id);
    }
  }

  pub fn addChatId(&mut self, id: String) {
    if !self.chatIds.contains(&id) {
      self.chatIds.push(id);
    }
  }
}
