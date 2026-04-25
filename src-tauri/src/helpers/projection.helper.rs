use nosql_orm::query::Projection;

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