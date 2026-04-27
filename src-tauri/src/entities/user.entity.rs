/* sys lib */
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/* crate */
use crate::entities::profile_entity::ProfileEntity;

/* nosql_orm */
use nosql_orm::error::{OrmError, OrmResult};
use nosql_orm::Model;

#[derive(Debug, Clone, Serialize, Deserialize, Model)]
#[table_name("users")]
#[soft_delete]
#[timestamp]
#[many_to_one("profile", "profiles", "profile_id")]
#[frontend_exclude(
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
  "qr_login_enabled"
)]
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
  pub profile: Option<ProfileEntity>,
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
  #[serde(default)]
  pub created_at: DateTime<Utc>,
  #[serde(default)]
  pub updated_at: DateTime<Utc>,
  #[serde(default)]
  pub deleted_at: Option<DateTime<Utc>>,
}

impl UserEntity {
  pub fn get_id(&self) -> &str {
    self.id.as_deref().unwrap_or("")
  }
}

#[derive(Debug, Clone, Serialize, Deserialize, nosql_orm::Validate)]
pub struct UserCreateModel {
  #[validate(email)]
  #[validate(required)]
  pub email: String,
  #[validate(not_empty)]
  #[validate(length(min = 3, max = 30))]
  pub username: String,
  #[validate(not_empty)]
  #[validate(length(min = 8, max = 100))]
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

impl nosql_orm::validators::Validate for UserUpdateModel {
  fn validate(&self) -> OrmResult<()> {
    if let Some(ref email) = self.email {
      if email.is_empty() {
        return Err(OrmError::Validation("email cannot be empty".to_string()));
      }
    }
    if let Some(ref username) = self.username {
      if username.is_empty() {
        return Err(OrmError::Validation("username cannot be empty".to_string()));
      }
      if username.len() > 30 {
        return Err(OrmError::Validation(
          "username cannot exceed 30 characters".to_string(),
        ));
      }
    }
    Ok(())
  }
}
