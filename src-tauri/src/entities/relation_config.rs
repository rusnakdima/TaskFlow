use nosql_orm::query::Projection;
use nosql_orm::relations::RelationDef;

pub struct RelationConfig;

pub const FRONTEND_EXCLUDED_FIELDS: &[&str] = &[
  "password",
  "totp_secret",
  "passkey_public_key",
  "passkey_credential_id",
  "passkey_device",
  "recovery_codes",
  "reset_token",
  "temporary_code",
  "code_expires_at",
  "biometric_enabled",
  "passkey_enabled",
  "totp_enabled",
  "qr_login_enabled",
];

pub fn user_projection() -> Projection {
  Projection::exclude(FRONTEND_EXCLUDED_FIELDS)
}

impl RelationConfig {
  pub fn todos_relations() -> Vec<(&'static str, RelationDef)> {
    vec![
      (
        "tasks",
        RelationDef::one_to_many("tasks", "tasks", "task_id"),
      ),
      ("user", RelationDef::many_to_one("user", "users", "user_id")),
      (
        "categories",
        RelationDef::many_to_many("categories", "categories", "categories"),
      ),
      (
        "assignees",
        RelationDef::many_to_many("assignees", "profiles", "assignees"),
      ),
      (
        "assignees_profiles",
        RelationDef::many_to_one("assignees", "profiles", "assignees")
          .local_key_in_array("assignees")
          .transform_map("user_id", "profiles", "id"),
      ),
    ]
  }

  pub fn tasks_relations() -> Vec<(&'static str, RelationDef)> {
    vec![
      (
        "subtasks",
        RelationDef::one_to_many("subtasks", "subtasks", "task_id"),
      ),
      (
        "comments",
        RelationDef::one_to_many("comments", "comments", "task_id"),
      ),
      (
        "assignees",
        RelationDef::many_to_many("assignees", "profiles", "assignees"),
      ),
      ("todo", RelationDef::many_to_one("todo", "todos", "task_id")),
    ]
  }

  pub fn subtasks_relations() -> Vec<(&'static str, RelationDef)> {
    vec![
      ("task", RelationDef::many_to_one("task", "tasks", "task_id")),
      (
        "comments",
        RelationDef::one_to_many("comments", "comments", "subtask_id"),
      ),
      (
        "assignees",
        RelationDef::many_to_many("assignees", "profiles", "assignees"),
      ),
    ]
  }

  pub fn comments_relations() -> Vec<(&'static str, RelationDef)> {
    vec![
      ("task", RelationDef::many_to_one("task", "tasks", "task_id")),
      (
        "subtask",
        RelationDef::many_to_one("subtask", "subtasks", "subtask_id"),
      ),
    ]
  }

  pub fn profiles_relations() -> Vec<(&'static str, RelationDef)> {
    vec![("user", RelationDef::many_to_one("user", "users", "user_id"))]
  }

  pub fn users_relations() -> Vec<(&'static str, RelationDef)> {
    vec![(
      "profile",
      RelationDef::many_to_one("profile", "profiles", "profile_id"),
    )]
  }

  pub fn categories_relations() -> Vec<(&'static str, RelationDef)> {
    vec![]
  }

  pub fn get_relations_for_table(table: &str) -> Vec<(&'static str, RelationDef)> {
    match table {
      "todos" => Self::todos_relations(),
      "tasks" => Self::tasks_relations(),
      "subtasks" => Self::subtasks_relations(),
      "comments" => Self::comments_relations(),
      "profiles" => Self::profiles_relations(),
      "users" => Self::users_relations(),
      "categories" => Self::categories_relations(),
      _ => vec![],
    }
  }

  pub fn get_relation_def(table: &str, path: &str) -> Option<RelationDef> {
    let relations = Self::get_relations_for_table(table);
    for (name, def) in relations {
      if name == path {
        return Some(def);
      }
    }
    None
  }

  pub fn needs_user_projection(table: &str, path: &str) -> bool {
    matches!(
      (table, path),
      ("todos", "user")
        | ("todos", "assignees_profiles")
        | ("profiles", "user")
        | ("tasks", "assignees")
        | ("subtasks", "assignees")
        | ("comments", "author")
    )
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::entities::traits::FrontendProjection;

  #[test]
  fn test_get_relation_def() {
    let def = RelationConfig::get_relation_def("todos", "tasks");
    assert!(def.is_some());
    let def = def.unwrap();
    assert_eq!(def.target_collection, "tasks");
    assert_eq!(def.foreign_key, "task_id");
  }

  #[test]
  fn test_excluded_fields_for_user() {
    let excluded =
      <crate::entities::user_entity::UserEntity as FrontendProjection>::excluded_fields();
    assert!(excluded.contains(&"password"));
    assert!(excluded.contains(&"totp_secret"));
    assert!(!excluded.contains(&"email"));
  }
}
