/* sys lib */
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::entities::traits::{Validatable, FrontendProjection, EntityRelations};
use nosql_orm::prelude::{Entity, EntityMeta, RelationDef, WithRelations};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserEntity {
  pub id: Option<String>,
  pub email: String,
  pub username: String,
  pub password: String,
  pub role: String,
  #[serde(default)]
  pub temporaryCode: String,
  #[serde(default)]
  pub codeExpiresAt: String,
  pub profileId: String,
  #[serde(skip)]
  pub profile: Option<crate::entities::profile_entity::ProfileEntity>,
  pub created_at: DateTime<Utc>,
  pub updated_at: DateTime<Utc>,
  pub deleted_at: Option<DateTime<Utc>>,
  #[serde(default)]
  pub totpEnabled: bool,
  #[serde(default)]
  pub totpSecret: String,
  #[serde(default)]
  pub passkeyCredentialId: String,
  #[serde(default)]
  pub passkeyPublicKey: String,
  #[serde(default)]
  pub passkeyDevice: String,
  #[serde(default)]
  pub passkeyEnabled: bool,
  #[serde(default)]
  pub biometricEnabled: bool,
  #[serde(default)]
  pub qrLoginEnabled: bool,
  #[serde(default)]
  pub recoveryCodes: Vec<String>,
}

impl FrontendProjection for UserEntity {
  fn excluded_fields() -> Vec<&'static str> {
    vec![
      "password",
      "totpSecret",
      "passkeyPublicKey",
      "passkeyCredentialId",
      "passkeyDevice",
      "recoveryCodes",
      "resetToken",
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
    vec![RelationDef::many_to_one("profile", "profiles", "profileId")]
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserCreateModel {
  pub email: String,
  pub username: String,
  pub password: String,
  pub role: String,
  #[serde(default)]
  pub temporaryCode: String,
  #[serde(default)]
  pub codeExpiresAt: String,
  pub profileId: String,
  #[serde(default)]
  pub totpEnabled: bool,
  #[serde(default)]
  pub totpSecret: String,
  #[serde(default)]
  pub passkeyCredentialId: String,
  #[serde(default)]
  pub passkeyPublicKey: String,
  #[serde(default)]
  pub passkeyDevice: String,
  #[serde(default)]
  pub passkeyEnabled: bool,
  #[serde(default)]
  pub biometricEnabled: bool,
  #[serde(default)]
  pub qrLoginEnabled: bool,
  #[serde(default)]
  pub recoveryCodes: Vec<String>,
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
      temporaryCode: value.temporaryCode,
      codeExpiresAt: value.codeExpiresAt,
      profileId: value.profileId,
      created_at: now,
      updated_at: now,
      deleted_at: None,
      profile: None,
      totpEnabled: value.totpEnabled,
      totpSecret: value.totpSecret,
      passkeyCredentialId: value.passkeyCredentialId,
      passkeyPublicKey: value.passkeyPublicKey,
      passkeyDevice: value.passkeyDevice,
      passkeyEnabled: value.passkeyEnabled,
      biometricEnabled: value.biometricEnabled,
      qrLoginEnabled: value.qrLoginEnabled,
      recoveryCodes: value.recoveryCodes,
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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
  pub temporaryCode: Option<String>,
  #[serde(default)]
  pub codeExpiresAt: Option<String>,
  #[serde(default)]
  pub profileId: Option<String>,
  #[serde(default)]
  pub created_at: Option<String>,
  #[serde(default)]
  pub updated_at: Option<String>,
  #[serde(default)]
  pub totpEnabled: Option<bool>,
  #[serde(default)]
  pub totpSecret: Option<String>,
  #[serde(default)]
  pub passkeyCredentialId: Option<String>,
  #[serde(default)]
  pub passkeyPublicKey: Option<String>,
  #[serde(default)]
  pub passkeyDevice: Option<String>,
  #[serde(default)]
  pub passkeyEnabled: Option<bool>,
  #[serde(default)]
  pub biometricEnabled: Option<bool>,
  #[serde(default)]
  pub qrLoginEnabled: Option<bool>,
  #[serde(default)]
  pub recoveryCodes: Option<Vec<String>>,
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
