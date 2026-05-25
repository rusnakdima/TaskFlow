use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum TodoPermission {
  VIEWER,
  EDITOR,
  MODERATOR,
  OWNER,
}

impl TodoPermission {
  pub fn from_str(role: &str) -> Self {
    match role.to_lowercase().as_str() {
      "viewer" => TodoPermission::VIEWER,
      "editor" => TodoPermission::EDITOR,
      "admin" | "moderator" => TodoPermission::MODERATOR,
      "owner" => TodoPermission::OWNER,
      _ => TodoPermission::VIEWER,
    }
  }

  pub fn can_delete_todo(&self) -> bool {
    matches!(self, TodoPermission::OWNER)
  }

  pub fn can_create_task(&self) -> bool {
    matches!(
      self,
      TodoPermission::EDITOR | TodoPermission::MODERATOR | TodoPermission::OWNER
    )
  }

  pub fn can_edit_task(&self) -> bool {
    matches!(
      self,
      TodoPermission::EDITOR | TodoPermission::MODERATOR | TodoPermission::OWNER
    )
  }

  pub fn can_delete_task(&self) -> bool {
    matches!(
      self,
      TodoPermission::EDITOR | TodoPermission::MODERATOR | TodoPermission::OWNER
    )
  }

  pub fn can_edit_subtask(&self) -> bool {
    matches!(
      self,
      TodoPermission::EDITOR | TodoPermission::MODERATOR | TodoPermission::OWNER
    )
  }

  pub fn can_delete_subtask(&self) -> bool {
    matches!(
      self,
      TodoPermission::EDITOR | TodoPermission::MODERATOR | TodoPermission::OWNER
    )
  }

  pub fn can_create_comment(&self) -> bool {
    matches!(
      self,
      TodoPermission::EDITOR | TodoPermission::MODERATOR | TodoPermission::OWNER
    )
  }

  pub fn can_edit_comment(&self) -> bool {
    matches!(
      self,
      TodoPermission::EDITOR | TodoPermission::MODERATOR | TodoPermission::OWNER
    )
  }

  pub fn can_delete_comment(&self) -> bool {
    matches!(
      self,
      TodoPermission::EDITOR | TodoPermission::MODERATOR | TodoPermission::OWNER
    )
  }

  pub fn can_edit_todo_fields(&self) -> bool {
    matches!(self, TodoPermission::MODERATOR | TodoPermission::OWNER)
  }

  pub fn can_archive_todo(&self) -> bool {
    matches!(self, TodoPermission::OWNER)
  }

  pub fn can_archive_task(&self) -> bool {
    matches!(self, TodoPermission::MODERATOR | TodoPermission::OWNER)
  }

  pub fn can_archive_subtask(&self) -> bool {
    matches!(self, TodoPermission::MODERATOR | TodoPermission::OWNER)
  }

  pub fn can_archive_comment(&self) -> bool {
    matches!(self, TodoPermission::MODERATOR | TodoPermission::OWNER)
  }
}

pub const ASSIGNEE_DEFAULT_ROLE: &str = "viewer";
