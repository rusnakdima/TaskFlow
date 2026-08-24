//! Auth Service Trait
//!
//! Domain service interface for authentication operations.
//!
//! Note: TaskFlow has complex auth (TOTP, QR, GitHub OAuth).
//! This trait captures the auth operations needed by the application layer.

use crate::domain::entities::auth_forms::{LoginForm, PasswordReset, SignupForm};
use crate::domain::services::DomainError;

/// Auth service interface.
#[async_trait::async_trait]
pub trait AuthService: Send + Sync {
    /// Check if a token is valid.
    async fn check_token(&self, token: String) -> Result<(), DomainError>;

    /// Login with credentials.
    async fn login(&self, form: LoginForm) -> Result<(), DomainError>;

    /// Register a new user.
    async fn register(&self, form: SignupForm) -> Result<(), DomainError>;

    /// Request password reset.
    async fn request_password_reset(&self, email: &str) -> Result<(), DomainError>;

    /// Verify reset code.
    async fn verify_code(&self, email: &str, code: &str) -> Result<(), DomainError>;

    /// Reset password.
    async fn reset_password(&self, reset: PasswordReset) -> Result<(), DomainError>;

    /// Change password.
    async fn change_password(&self, token: &str, new_password: &str) -> Result<(), DomainError>;

    // TODO: Add TOTP methods
    // async fn setup_totp(&self, username: &str) -> Result<TotpSetup, DomainError>;
    // async fn enable_totp(&self, username: &str, code: &str) -> Result<(), DomainError>;
    // async fn verify_totp(&self, username: &str, code: &str) -> Result<(), DomainError>;
}
