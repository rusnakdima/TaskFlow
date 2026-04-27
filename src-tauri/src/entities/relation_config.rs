use nosql_orm::query::Projection;

pub struct RelationConfig;

impl RelationConfig {
  pub fn get_relation_exclusion_projection(table: &str) -> Projection {
    Reflection::from_entity(table)
  }
}

pub struct Reflection;

impl Reflection {
  pub fn from_entity(table: &str) -> Projection {
    match table {
      "todos" => {
        let fields = vec![
          "tasks",
          "subtasks", 
          "user",
          "categories",
          "assignees",
          "assignees_profiles",
        ];
        Projection::exclude(&fields)
      }
      "tasks" => {
        let fields = vec![
          "subtasks",
          "comments", 
          "todo",
          "assignees",
          "assignees_profiles",
        ];
        Projection::exclude(&fields)
      }
      "subtasks" => {
        let fields = vec![
          "task",
          "comments",
          "assignees",
          "assignees_profiles",
        ];
        Projection::exclude(&fields)
      }
      "comments" => {
        let fields = vec!["task", "subtask"];
        Projection::exclude(&fields)
      }
      "profiles" => {
        let fields = vec!["user"];
        Projection::exclude(&fields)
      }
      "users" => {
        let fields = vec!["profile"];
        Projection::exclude(&fields)
      }
      _ => Projection::exclude(&[]),
    }
  }
}

pub fn user_projection() -> Projection {
  let excluded = vec![
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
  Projection::exclude(&excluded)
}

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

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_user_projection() {
    let proj = user_projection();
    assert!(proj.excluded_fields.contains(&"password".to_string()));
  }
}