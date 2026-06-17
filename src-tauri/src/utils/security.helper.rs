#[macro_export]
macro_rules! taskflow_excluded_fields {
  () => {
    vec![
      "password".to_string(),
      "totp_secret".to_string(),
      "passkey_public_key".to_string(),
      "passkey_credential_id".to_string(),
      "passkey_device".to_string(),
      "recovery_codes".to_string(),
      "reset_token".to_string(),
      "temporary_code".to_string(),
      "code_expires_at".to_string(),
    ]
  };
}

pub fn security_projection() -> nosql_orm::query::Projection {
  nosql_orm::query::Projection::exclude_vec(taskflow_excluded_fields!())
}
