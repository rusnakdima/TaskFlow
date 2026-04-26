use nosql_orm::query::Projection;
use nosql_orm::relations::{register_collection_relations, RelationDef, RelationType};

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
        RelationDef::one_to_many("tasks", "tasks", "todo_id"),
      ),
      (
        "subtasks",
        RelationDef::one_to_many("subtasks", "subtasks", "todo_id"), // Added this
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
        RelationDef::many_to_one("assignees_profiles", "profiles", "assignees")
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
      (
        "assignees_profiles",
        RelationDef::many_to_one("assignees_profiles", "profiles", "assignees")
          .local_key_in_array("assignees")
          .transform_map("user_id", "profiles", "id"),
      ),
      ("todo", RelationDef::many_to_one("todo", "todos", "todo_id")),
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
      (
        "assignees_profiles",
        RelationDef::many_to_one("assignees_profiles", "profiles", "assignees")
          .local_key_in_array("assignees")
          .transform_map("user_id", "profiles", "id"),
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

  #[allow(dead_code)]
  pub fn categories_relations() -> Vec<(&'static str, RelationDef)> {
    vec![]
  }

  #[allow(dead_code)]
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

  #[allow(dead_code)]
  pub fn get_relation_def(table: &str, path: &str) -> Option<RelationDef> {
    let relations = Self::get_relations_for_table(table);
    for (name, def) in relations {
      if name == path {
        return Some(def);
      }
    }
    None
  }

  #[allow(dead_code)]
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

  #[allow(dead_code)]
  pub fn get_relation_type(table: &str, path: &str) -> RelationType {
    let relations = Self::get_relations_for_table(table);
    for (name, def) in relations {
      if name == path {
        return def.relation_type;
      }
    }
    RelationType::ManyToOne
  }

  pub fn get_relation_exclusion_projection(table: &str) -> Projection {
    let relations = Self::get_relations_for_table(table);
    let mut fields: Vec<&str> = relations.into_iter().map(|(name, _)| name).collect();
    // Add some common relation aliases that might not be in the def
    if table == "todos" {
      fields.push("assigneesProfiles");
    }
    Projection::exclude(&fields)
  }

  pub fn register_all_relations() {
    println!("DEBUG: register_all_relations called");

    let todos_rels = Self::todos_relations();
    println!(
      "DEBUG: todos_relations: {:?}",
      todos_rels.iter().map(|(n, _)| *n).collect::<Vec<_>>()
    );

    register_collection_relations("todos", todos_rels.into_iter().map(|(_n, d)| d).collect());
    println!("DEBUG: todos relations registered");
    register_collection_relations(
      "tasks",
      Self::tasks_relations()
        .into_iter()
        .map(|(_n, d)| d)
        .collect(),
    );
    register_collection_relations(
      "subtasks",
      Self::subtasks_relations()
        .into_iter()
        .map(|(_n, d)| d)
        .collect(),
    );
    register_collection_relations(
      "comments",
      Self::comments_relations()
        .into_iter()
        .map(|(_n, d)| d)
        .collect(),
    );
    register_collection_relations(
      "profiles",
      Self::profiles_relations()
        .into_iter()
        .map(|(_n, d)| d)
        .collect(),
    );
    register_collection_relations(
      "users",
      Self::users_relations()
        .into_iter()
        .map(|(_n, d)| d)
        .collect(),
    );
    register_collection_relations("categories", vec![]);
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use nosql_orm::prelude::FrontendProjection;

  #[test]
  fn test_get_relation_def() {
    let def = RelationConfig::get_relation_def("todos", "tasks");
    assert!(def.is_some());
    let def = def.unwrap();
    assert_eq!(def.target_collection, "tasks");
    assert_eq!(def.foreign_key, "todo_id");
  }

  #[test]
  fn test_excluded_fields_for_user() {
    let excluded =
      <crate::entities::user_entity::UserEntity as FrontendProjection>::frontend_excluded_fields();
    assert!(excluded.contains(&"password"));
    assert!(excluded.contains(&"totp_secret"));
    assert!(!excluded.contains(&"email"));
  }
}
