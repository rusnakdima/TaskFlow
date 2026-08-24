//! User Entity
//!
//! Domain entity representing a TaskFlow user.
//!
//! # Source
//! Migrated from `src-tauri/src/entities/user.entity.rs`
//!
//! # Notes
//! This is TaskFlow-specific user with auth fields like TOTP, QR login, GitHub OAuth.
//! Cross-app user (without auth specifics) is in dioxus-shared.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// User entity (app-specific with auth fields).
///
/// Contains TaskFlow-specific auth fields:
/// - TOTP (2FA)
/// - QR login
/// - GitHub OAuth
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
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
    #[serde(default)]
    pub totp_enabled: bool,
    #[serde(default)]
    pub totp_secret: String,
    #[serde(default)]
    pub qr_login_enabled: bool,
    #[serde(default)]
    pub github_access_token: String,
    #[serde(default)]
    pub github_refresh_token: String,
    #[serde(default)]
    pub github_token_expiry: String,
    #[serde(default)]
    pub github_user_id: String,
    #[serde(default)]
    pub github_username: String,
    #[serde(default)]
    pub recovery_codes: Vec<String>,
    #[serde(default)]
    pub created_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub updated_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub deleted_at: Option<DateTime<Utc>>,
}

/// Creation model for UserEntity.
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
    pub qr_login_enabled: bool,
    #[serde(default)]
    pub github_access_token: String,
    #[serde(default)]
    pub github_refresh_token: String,
    #[serde(default)]
    pub github_token_expiry: String,
    #[serde(default)]
    pub github_user_id: String,
    #[serde(default)]
    pub github_username: String,
    #[serde(default)]
    pub recovery_codes: Vec<String>,
}

impl UserEntity {
    /// Get the user ID as a string slice.
    pub fn id(&self) -> &str {
        self.id.as_deref().unwrap_or("")
    }
}

impl UserCreateModel {
    pub fn into_user_entity(self) -> UserEntity {
        UserEntity {
            id: None,
            email: self.email,
            username: self.username,
            password: self.password,
            role: self.role,
            temporary_code: self.temporary_code,
            code_expires_at: self.code_expires_at,
            profile_id: self.profile_id,
            totp_enabled: self.totp_enabled,
            totp_secret: self.totp_secret,
            qr_login_enabled: self.qr_login_enabled,
            github_access_token: self.github_access_token,
            github_refresh_token: self.github_refresh_token,
            github_token_expiry: self.github_token_expiry,
            github_user_id: self.github_user_id,
            github_username: self.github_username,
            recovery_codes: self.recovery_codes,
            created_at: None,
            updated_at: None,
            deleted_at: None,
        }
    }
}
