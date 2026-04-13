/* sys lib */
use mongodb::bson::{oid::ObjectId, Uuid};
use serde::{Deserialize, Serialize};

use crate::models::traits::Validatable;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserModel {
  pub _id: ObjectId,
  pub id: String,
  pub email: String,
  pub username: String,
  pub password: String,
  pub role: String,
  #[serde(default)]
  pub temporaryCode: String,
  #[serde(default)]
  pub codeExpiresAt: String,
  pub profileId: String,
  pub createdAt: String,
  pub updatedAt: String,
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

impl From<UserCreateModel> for UserModel {
  fn from(value: UserCreateModel) -> Self {
    let now = chrono::Utc::now();
    let formatted = now.to_rfc3339_opts(chrono::SecondsFormat::Secs, true);

    UserModel {
      _id: ObjectId::new(),
      id: Uuid::new().to_string(),
      email: value.email,
      username: value.username,
      password: value.password,
      role: value.role,
      temporaryCode: value.temporaryCode,
      codeExpiresAt: value.codeExpiresAt,
      profileId: value.profileId,
      createdAt: formatted.clone(),
      updatedAt: formatted.clone(),
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
  pub _id: Option<ObjectId>,
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
  pub createdAt: Option<String>,
  #[serde(default)]
  pub updatedAt: Option<String>,
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

impl From<UserUpdateModel> for UserModel {
  fn from(value: UserUpdateModel) -> Self {
    let now = chrono::Utc::now();
    let formatted = now.to_rfc3339_opts(chrono::SecondsFormat::Secs, true);

    UserModel {
      _id: value._id.unwrap_or_else(ObjectId::new),
      id: value.id.unwrap_or_default(),
      email: value.email.unwrap_or_default(),
      username: value.username.unwrap_or_default(),
      password: value.password.unwrap_or_default(),
      role: value.role.unwrap_or_default(),
      temporaryCode: value.temporaryCode.unwrap_or_default(),
      codeExpiresAt: value.codeExpiresAt.unwrap_or_default(),
      profileId: value.profileId.unwrap_or_default(),
      createdAt: value.createdAt.unwrap_or_default(),
      updatedAt: formatted,
      totpEnabled: value.totpEnabled.unwrap_or_default(),
      totpSecret: value.totpSecret.unwrap_or_default(),
      passkeyCredentialId: value.passkeyCredentialId.unwrap_or_default(),
      passkeyPublicKey: value.passkeyPublicKey.unwrap_or_default(),
      passkeyDevice: value.passkeyDevice.unwrap_or_default(),
      passkeyEnabled: value.passkeyEnabled.unwrap_or_default(),
      biometricEnabled: value.biometricEnabled.unwrap_or_default(),
      qrLoginEnabled: value.qrLoginEnabled.unwrap_or_default(),
      recoveryCodes: value.recoveryCodes.unwrap_or_default(),
    }
  }
}
