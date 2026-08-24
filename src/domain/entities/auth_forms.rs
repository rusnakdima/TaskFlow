//! Auth Form Value Objects
//!
//! Value objects for authentication forms.
//!
//! # Source
//! Migrated from `src-tauri/src/entities/login_form.entity.rs`,
//! `signup_form.entity.rs`, `password_reset.entity.rs`

use serde::{Deserialize, Serialize};

/// Login form data.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct LoginForm {
    pub username: String,
    pub password: String,
    pub remember: bool,
}

/// Signup form data.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct SignupForm {
    pub email: String,
    pub username: String,
    pub password: String,
    // Add other fields as needed from signup_form.entity.rs
}

/// Password reset form data.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct PasswordReset {
    pub email: String,
    pub code: String,
    pub new_password: String,
}
