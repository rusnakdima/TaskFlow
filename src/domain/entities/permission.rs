use serde::{Deserialize, Serialize};
use std::str::FromStr;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "UPPERCASE")]
pub enum TodoPermission {
    Viewer,
    Editor,
    Moderator,
    Owner,
}

impl TodoPermission {
    #[allow(clippy::should_implement_trait)]
    pub fn from_str(role: &str) -> Self {
        match role.to_lowercase().as_str() {
            "viewer" => TodoPermission::Viewer,
            "editor" => TodoPermission::Editor,
            "admin" | "moderator" => TodoPermission::Moderator,
            "owner" => TodoPermission::Owner,
            _ => TodoPermission::Viewer,
        }
    }

    pub fn can_delete_todo(&self) -> bool {
        matches!(self, TodoPermission::Owner)
    }

    pub fn can_create_task(&self) -> bool {
        matches!(
            self,
            TodoPermission::Editor | TodoPermission::Moderator | TodoPermission::Owner
        )
    }

    pub fn can_edit_task(&self) -> bool {
        matches!(
            self,
            TodoPermission::Editor | TodoPermission::Moderator | TodoPermission::Owner
        )
    }

    pub fn can_delete_task(&self) -> bool {
        matches!(
            self,
            TodoPermission::Editor | TodoPermission::Moderator | TodoPermission::Owner
        )
    }

    pub fn can_edit_subtask(&self) -> bool {
        matches!(
            self,
            TodoPermission::Editor | TodoPermission::Moderator | TodoPermission::Owner
        )
    }

    pub fn can_delete_subtask(&self) -> bool {
        matches!(
            self,
            TodoPermission::Editor | TodoPermission::Moderator | TodoPermission::Owner
        )
    }

    pub fn can_create_comment(&self) -> bool {
        matches!(
            self,
            TodoPermission::Editor | TodoPermission::Moderator | TodoPermission::Owner
        )
    }

    pub fn can_edit_comment(&self) -> bool {
        matches!(
            self,
            TodoPermission::Editor | TodoPermission::Moderator | TodoPermission::Owner
        )
    }

    pub fn can_delete_comment(&self) -> bool {
        matches!(
            self,
            TodoPermission::Editor | TodoPermission::Moderator | TodoPermission::Owner
        )
    }

    pub fn can_edit_todo_fields(&self) -> bool {
        matches!(self, TodoPermission::Moderator | TodoPermission::Owner)
    }

    pub fn can_archive_todo(&self) -> bool {
        matches!(self, TodoPermission::Owner)
    }

    pub fn can_archive_task(&self) -> bool {
        matches!(self, TodoPermission::Moderator | TodoPermission::Owner)
    }

    pub fn can_archive_subtask(&self) -> bool {
        matches!(self, TodoPermission::Moderator | TodoPermission::Owner)
    }

    pub fn can_archive_comment(&self) -> bool {
        matches!(self, TodoPermission::Moderator | TodoPermission::Owner)
    }
}

impl FromStr for TodoPermission {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Ok(TodoPermission::from_str(s))
    }
}

pub const ASSIGNEE_DEFAULT_ROLE: &str = "viewer";
