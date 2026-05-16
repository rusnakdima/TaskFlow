use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum TodoPermission {
  VIEWER,
  EDITOR,
  ADMIN,
  MODERATOR,
  OWNER,
}

impl TodoPermission {
  pub fn from_str(role: &str) -> Self {
    match role.to_lowercase().as_str() {
      "viewer" => TodoPermission::VIEWER,
      "editor" => TodoPermission::EDITOR,
      "admin" => TodoPermission::ADMIN,
      "moderator" => TodoPermission::MODERATOR,
      "owner" => TodoPermission::OWNER,
      _ => TodoPermission::VIEWER,
    }
  }

  pub fn as_str(&self) -> &'static str {
    match self {
      TodoPermission::VIEWER => "viewer",
      TodoPermission::EDITOR => "editor",
      TodoPermission::ADMIN => "admin",
      TodoPermission::MODERATOR => "moderator",
      TodoPermission::OWNER => "owner",
    }
  }

  pub fn can_edit_todo(&self) -> bool {
    matches!(self, TodoPermission::ADMIN | TodoPermission::OWNER)
  }

  pub fn can_delete_todo(&self) -> bool {
    matches!(self, TodoPermission::OWNER)
  }

  pub fn can_manage_assignees(&self) -> bool {
    matches!(self, TodoPermission::OWNER)
  }

  pub fn can_transfer_ownership(&self) -> bool {
    matches!(self, TodoPermission::OWNER)
  }

  pub fn can_manage_gh_repo(&self) -> bool {
    matches!(self, TodoPermission::OWNER)
  }

  pub fn can_create_task(&self) -> bool {
    matches!(
      self,
      TodoPermission::EDITOR
        | TodoPermission::ADMIN
        | TodoPermission::MODERATOR
        | TodoPermission::OWNER
    )
  }

  pub fn can_edit_task(&self) -> bool {
    matches!(
      self,
      TodoPermission::EDITOR
        | TodoPermission::ADMIN
        | TodoPermission::MODERATOR
        | TodoPermission::OWNER
    )
  }

  pub fn can_delete_task(&self) -> bool {
    matches!(
      self,
      TodoPermission::EDITOR
        | TodoPermission::ADMIN
        | TodoPermission::MODERATOR
        | TodoPermission::OWNER
    )
  }

  pub fn can_create_subtask(&self) -> bool {
    matches!(
      self,
      TodoPermission::EDITOR
        | TodoPermission::ADMIN
        | TodoPermission::MODERATOR
        | TodoPermission::OWNER
    )
  }

  pub fn can_edit_subtask(&self) -> bool {
    matches!(
      self,
      TodoPermission::EDITOR
        | TodoPermission::ADMIN
        | TodoPermission::MODERATOR
        | TodoPermission::OWNER
    )
  }

  pub fn can_delete_subtask(&self) -> bool {
    matches!(
      self,
      TodoPermission::EDITOR
        | TodoPermission::ADMIN
        | TodoPermission::MODERATOR
        | TodoPermission::OWNER
    )
  }

  pub fn can_create_comment(&self) -> bool {
    matches!(
      self,
      TodoPermission::EDITOR
        | TodoPermission::ADMIN
        | TodoPermission::MODERATOR
        | TodoPermission::OWNER
    )
  }

  pub fn can_edit_comment(&self) -> bool {
    matches!(
      self,
      TodoPermission::EDITOR
        | TodoPermission::ADMIN
        | TodoPermission::MODERATOR
        | TodoPermission::OWNER
    )
  }

  pub fn can_delete_comment(&self) -> bool {
    matches!(
      self,
      TodoPermission::EDITOR
        | TodoPermission::ADMIN
        | TodoPermission::MODERATOR
        | TodoPermission::OWNER
    )
  }

  pub fn can_view_todo(&self) -> bool {
    true
  }
}

pub const ASSIGNEE_DEFAULT_ROLE: &str = "viewer";
