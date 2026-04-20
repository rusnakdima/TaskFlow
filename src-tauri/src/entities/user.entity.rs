/* sys lib */
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::entities::traits::{EntityRelations, FrontendProjection, Validatable};
use nosql_orm::prelude::{Entity, EntityMeta, RelationDef, WithRelations};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserEntity {
  pub id: Option<String>,
  pub email: String,
  pub username: String,
  pub password: String,
  pub role: String,
  #[serde(default)]
  pub temporary_code: String,
  #[serde(default)]
  pub code_expires_at: String,
  pub profile_id: String,
  pub profile: Option<crate::entities::profile_entity::ProfileEntity>,
  pub created_at: DateTime<Utc>,
  pub updated_at: DateTime<Utc>,
  pub deleted_at: Option<DateTime<Utc>>,
  #[serde(default)]
  pub totp_enabled: bool,
  #[serde(default)]
  pub totp_secret: String,
  #[serde(default)]
  pub passkey_credential_id: String,
  #[serde(default)]
  pub passkey_public_key: String,
  #[serde(default)]
  pub passkey_device: String,
  #[serde(default)]
  pub passkey_enabled: bool,
  #[serde(default)]
  pub biometric_enabled: bool,
  #[serde(default)]
  pub qr_login_enabled: bool,
  #[serde(default)]
  pub recovery_codes: Vec<String>,
}

impl FrontendProjection for UserEntity {
  fn excluded_fields() -> Vec<&'static str> {
    vec![
      "password",
      "totp_secret",
      "passkey_public_key",
      "passkey_credential_id",
      "passkey_device",
      "recovery_codes",
      "reset_token",
    ]
  }
}

impl EntityRelations for UserEntity {
  fn relation_paths() -> Vec<&'static str> {
    vec!["profile"]
  }

  fn nested_relation_map() -> Vec<(&'static str, Vec<&'static str>)> {
    vec![]
  }
}

impl Entity for UserEntity {
  fn meta() -> EntityMeta {
    EntityMeta::new("users")
  }

  fn get_id(&self) -> Option<String> {
    self.id.clone()
  }

  fn set_id(&mut self, id: String) {
    self.id = Some(id);
  }

  fn is_soft_deletable() -> bool {
    true
  }
}

impl WithRelations for UserEntity {
  fn relations() -> Vec<RelationDef> {
    vec![RelationDef::many_to_one("profile", "profiles", "profile_id")]
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserCreateModel {
  pub email: String,
  pub username: String,
  pub password: String,
  pub role: String,
  #[serde(default)]
  pub temporary_code: String,
  #[serde(default)]
  pub code_expires_at: String,
  pub profile_id: String,
  #[serde(default)]
  pub totp_enabled: bool,
  #[serde(default)]
  pub totp_secret: String,
  #[serde(default)]
  pub passkey_credential_id: String,
  #[serde(default)]
  pub passkey_public_key: String,
  #[serde(default)]
  pub passkey_device: String,
  #[serde(default)]
  pub passkey_enabled: bool,
  #[serde(default)]
  pub biometric_enabled: bool,
  #[serde(default)]
  pub qr_login_enabled: bool,
  #[serde(default)]
  pub recovery_codes: Vec<String>,
}

impl Validatable for UserCreateModel {
  fn validate(&self) -> Result<(), String> {
    if self.email.is_empty() {
      return Err("email cannot be empty".to_string());
    }
    if self.username.is_empty() {
      return Err("username cannot be empty".to_string());
    }
    if self.password.is_empty() {
      return Err("password cannot be empty".to_string());
    }
    Ok(())
  }
}

impl From<UserCreateModel> for UserEntity {
  fn from(value: UserCreateModel) -> Self {
    let now = Utc::now();

    UserEntity {
      id: None,
      email: value.email,
      username: value.username,
      password: value.password,
      role: value.role,
      temporary_code: value.temporary_code,
      code_expires_at: value.code_expires_at,
      profile_id: value.profile_id,
      created_at: now,
      updated_at: now,
      deleted_at: None,
      profile: None,
      totp_enabled: value.totp_enabled,
      totp_secret: value.totp_secret,
      passkey_credential_id: value.passkey_credential_id,
      passkey_public_key: value.passkey_public_key,
      passkey_device: value.passkey_device,
      passkey_enabled: value.passkey_enabled,
      biometric_enabled: value.biometric_enabled,
      qr_login_enabled: value.qr_login_enabled,
      recovery_codes: value.recovery_codes,
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserUpdateModel {
  #[serde(default)]
  pub id: Option<String>,
  #[serde(default)]
  pub email: Option<String>,
  #[serde(default)]
  pub username: Option<String>,
  #[serde(default)]
  pub password: Option<String>,
  #[serde(default)]
  pub role: Option<String>,
  #[serde(default)]
  pub temporary_code: Option<String>,
  #[serde(default)]
  pub code_expires_at: Option<String>,
  #[serde(default)]
  pub profile_id: Option<String>,
  #[serde(default)]
  pub created_at: Option<String>,
  #[serde(default)]
  pub updated_at: Option<String>,
  #[serde(default)]
  pub totp_enabled: Option<bool>,
  #[serde(default)]
  pub totp_secret: Option<String>,
  #[serde(default)]
  pub passkey_credential_id: Option<String>,
  #[serde(default)]
  pub passkey_public_key: Option<String>,
  #[serde(default)]
  pub passkey_device: Option<String>,
  #[serde(default)]
  pub passkey_enabled: Option<bool>,
  #[serde(default)]
  pub biometric_enabled: Option<bool>,
  #[serde(default)]
  pub qr_login_enabled: Option<bool>,
  #[serde(default)]
  pub recovery_codes: Option<Vec<String>>,
}

impl Validatable for UserUpdateModel {
  fn validate(&self) -> Result<(), String> {
    if let Some(ref email) = self.email {
      if email.is_empty() {
        return Err("email cannot be empty".to_string());
      }
    }
    if let Some(ref username) = self.username {
      if username.is_empty() {
        return Err("username cannot be empty".to_string());
      }
    }
    Ok(())
  }
}

impl UserEntity {
  pub fn get_id(&self) -> &str {
    self.id.as_deref().unwrap_or("")
  }
}