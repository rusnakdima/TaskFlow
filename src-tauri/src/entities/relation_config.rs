use nosql_orm::query::Projection;
use nosql_orm::relations::RelationDef;

pub struct RelationConfig;

pub const FRONTEND_EXCLUDED_FIELDS: &[&str] = &[
  "password",
  "totpSecret",
  "passkeyPublicKey",
  "passkeyCredentialId",
  "passkeyDevice",
  "recoveryCodes",
  "resetToken",
  "temporaryCode",
  "codeExpiresAt",
  "biometricEnabled",
  "passkeyEnabled",
  "totpEnabled",
  "qrLoginEnabled",
];

pub fn user_projection() -> Projection {
  Projection::exclude(FRONTEND_EXCLUDED_FIELDS)
}

impl RelationConfig {
  pub fn todos_relations() -> Vec<(&'static str, RelationDef)> {
    vec![
      (
        "tasks",
        RelationDef::one_to_many("tasks", "tasks", "todoId"),
      ),
      ("user", RelationDef::many_to_one("user", "users", "userId")),
      (
        "categories",
        RelationDef::many_to_many("categories", "categories", "categories"),
      ),
      (
        "assignees",
        RelationDef::many_to_many("assignees", "profiles", "assignees"),
      ),
      (
        "assigneesProfiles",
        RelationDef::many_to_one("assignees", "profiles", "assignees")
          .local_key_in_array("assignees")
          .transform_map("userId", "profiles", "id"),
      ),
    ]
  }

  pub fn tasks_relations() -> Vec<(&'static str, RelationDef)> {
    vec![
      (
        "subtasks",
        RelationDef::one_to_many("subtasks", "subtasks", "taskId"),
      ),
      (
        "comments",
        RelationDef::one_to_many("comments", "comments", "taskId"),
      ),
      (
        "assignees",
        RelationDef::many_to_many("assignees", "profiles", "assignees"),
      ),
      ("todo", RelationDef::many_to_one("todo", "todos", "todoId")),
    ]
  }

  pub fn subtasks_relations() -> Vec<(&'static str, RelationDef)> {
    vec![
      ("task", RelationDef::many_to_one("task", "tasks", "taskId")),
      (
        "comments",
        RelationDef::one_to_many("comments", "comments", "subtaskId"),
      ),
      (
        "assignees",
        RelationDef::many_to_many("assignees", "profiles", "assignees"),
      ),
    ]
  }

  pub fn comments_relations() -> Vec<(&'static str, RelationDef)> {
    vec![
      ("task", RelationDef::many_to_one("task", "tasks", "taskId")),
      (
        "subtask",
        RelationDef::many_to_one("subtask", "subtasks", "subtaskId"),
      ),
    ]
  }

  pub fn profiles_relations() -> Vec<(&'static str, RelationDef)> {
    vec![("user", RelationDef::many_to_one("user", "users", "userId"))]
  }

  pub fn users_relations() -> Vec<(&'static str, RelationDef)> {
    vec![(
      "profile",
      RelationDef::many_to_one("profile", "profiles", "profileId"),
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
        | ("todos", "assigneesProfiles")
        | ("profiles", "user")
        | ("tasks", "assignees")
        | ("subtasks", "assignees")
        | ("comments", "author")
    )
  }

  #[allow(dead_code)]
  pub fn relation_needs_projection(relation_name: &str) -> bool {
    matches!(relation_name, "assignees" | "user" | "author")
  }

  #[allow(dead_code)]
  pub fn parse_load_paths(table: &str, load_paths: &[String]) -> Vec<(String, RelationDef)> {
    let mut result = Vec::new();
    let relations = Self::get_relations_for_table(table);

    for path in load_paths {
      if path.contains('.') {
        continue;
      }
      for (name, def) in &relations {
        if *name == path.as_str() {
          result.push((path.clone(), def.clone()));
          break;
        }
      }
    }
    result
  }

  #[allow(dead_code)]
  pub fn nested_relation_key(base: &str, nested: &str) -> String {
    format!("{}.{}", base, nested)
  }

  #[allow(dead_code)]
  pub fn is_nested_path(path: &str) -> bool {
    path.contains('.')
  }

  pub fn split_nested_path(path: &str) -> Option<(&str, &str)> {
    let parts: Vec<&str> = path.split('.').collect();
    if parts.len() == 2 {
      Some((parts[0], parts[1]))
    } else {
      None
    }
  }

  pub fn get_nested_relation(table: &str, base: &str, nested: &str) -> Option<RelationDef> {
    match (table, base, nested) {
      ("todos", "tasks", "subtasks") => {
        Some(RelationDef::one_to_many("subtasks", "subtasks", "taskId"))
      }
      ("todos", "tasks", "comments") => {
        Some(RelationDef::one_to_many("comments", "comments", "taskId"))
      }
      ("tasks", "subtasks", "comments") => Some(RelationDef::one_to_many(
        "comments",
        "comments",
        "subtaskId",
      )),
      ("subtasks", "subtasks", "comments") => Some(RelationDef::one_to_many(
        "comments",
        "comments",
        "subtaskId",
      )),
      _ => None,
    }
  }

  #[allow(dead_code)]
  pub fn nested_needs_projection(_table: &str, base: &str, nested: &str) -> bool {
    matches!(
      (base, nested),
      ("tasks", "subtasks") | ("tasks", "comments") | ("subtasks", "comments")
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
    assert_eq!(def.foreign_key, "todoId");
  }

  #[test]
  fn test_split_nested_path() {
    let (base, nested) = RelationConfig::split_nested_path("tasks.subtasks").unwrap();
    assert_eq!(base, "tasks");
    assert_eq!(nested, "subtasks");
  }

  #[test]
  fn test_excluded_fields_for_user() {
    let excluded =
      <crate::entities::user_entity::UserEntity as FrontendProjection>::excluded_fields();
    assert!(excluded.contains(&"password"));
    assert!(excluded.contains(&"totpSecret"));
    assert!(!excluded.contains(&"email"));
  }
}