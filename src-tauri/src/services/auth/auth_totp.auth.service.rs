/* sys lib */
use base32::Alphabet;
use rand::Rng;
use std::sync::Arc;

/* providers */
use nosql_orm::provider::DatabaseProvider;
use nosql_orm::providers::JsonProvider;
use nosql_orm::providers::MongoProvider;
use nosql_orm::query::Filter;
use nosql_orm::repository::Repository;

/* models */
use crate::entities::{
  profile_entity::ProfileEntity,
  response_entity::{DataValue, ResponseModel, ResponseStatus},
  user_entity::UserEntity,
};

/* helpers */
use crate::helpers::{
  qr_helper,
  response_helper::{err_response, err_response_formatted, success_response},
};

/* services */
use super::auth_token::AuthTokenService;

#[derive(Clone)]
pub struct AuthTotpService {
  pub json_provider: JsonProvider,
  pub mongodb_provider: Option<Arc<MongoProvider>>,
  token_service: Option<Arc<AuthTokenService>>,
}

impl AuthTotpService {
  pub fn new(
    json_provider: JsonProvider,
    mongodb_provider: Option<Arc<MongoProvider>>,
    token_service: Option<Arc<AuthTokenService>>,
  ) -> Self {
    Self {
      json_provider,
      mongodb_provider,
      token_service,
    }
  }

  pub fn generate_secret(&self) -> String {
    let secret: [u8; 20] = rand::thread_rng().gen();
    base32::encode(Alphabet::Rfc4648 { padding: false }, &secret).to_ascii_lowercase()
  }

  pub fn generate_qr_code(&self, secret: &str, email: &str) -> String {
    let otpauth = format!(
      "otpauth://totp/TaskFlow:{}?secret={}&issuer=TaskFlow",
      email, secret
    );
    qr_helper::generate_qr_code_data_url(&otpauth)
  }

  fn decode_base32_secret(secret: &str) -> Option<Vec<u8>> {
    let secret_upper = secret.to_ascii_uppercase();
    let decoded = base32::decode(base32::Alphabet::Rfc4648 { padding: false }, &secret_upper)?;
    if decoded.len() == 20 {
      Some(decoded)
    } else {
      None
    }
  }

  pub fn generate_recovery_codes(&self) -> Vec<String> {
    let mut codes = Vec::new();
    for _ in 0..8 {
      let code: u32 = rand::thread_rng().gen();
      codes.push(format!("{:06}", code % 1000000));
    }
    codes
  }

  pub async fn verify_totp_code(&self, secret: &str, code: &str) -> bool {
    let code = code.trim();

    if code.len() != 6 {
      return false;
    }

    if !code.chars().all(|c| c.is_ascii_digit()) {
      return false;
    }

    let secret_lower = secret.to_ascii_lowercase();

    let secret_bytes = match Self::decode_base32_secret(&secret_lower) {
      Some(bytes) => bytes,
      None => {
        return false;
      }
    };

    let totp = totp_rs::TOTP::new(totp_rs::Algorithm::SHA1, 6, 1, 30, secret_bytes);

    let current_time = std::time::SystemTime::now()
      .duration_since(std::time::UNIX_EPOCH)
      .map(|d| d.as_secs())
      .unwrap_or(0);

    let time_step = current_time / 30;

    for offset in [-1i32, 0, 1].iter() {
      let check_time = ((time_step as i64) + (*offset as i64)) * 30;
      let generated = totp.generate(check_time as u64);
      if generated == code {
        return true;
      }
    }
    false
  }

  pub async fn setup_totp(&self, username: &str) -> Result<ResponseModel, ResponseModel> {
    let user = self.find_user(username).await?;

    let secret = self.generate_secret();
    let secret_lower = secret.to_ascii_lowercase();
    let recovery_codes = self.generate_recovery_codes();
    let qr_code = self.generate_qr_code(&secret_lower, &user.email);

    self
      .update_totp_settings(username, false, &secret_lower, recovery_codes.clone())
      .await?;

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "TOTP setup initiated".to_string(),
      data: DataValue::Object(serde_json::json!({
        "qr_code": qr_code,
        "secret": secret_lower,
        "recovery_codes": recovery_codes
      })),
    })
  }

  pub async fn enable_totp(
    &self,
    username: &str,
    code: &str,
  ) -> Result<ResponseModel, ResponseModel> {
    let user = self.find_user(username).await?;

    if user.totp_secret.is_empty() {
      return Err(err_response("TOTP not setup. Please setup TOTP first."));
    }

    if !self.verify_totp_code(&user.totp_secret, code).await {
      return Err(err_response("Invalid TOTP code"));
    }

    self
      .update_totp_settings(
        username,
        true,
        &user.totp_secret,
        user.recovery_codes.clone(),
      )
      .await?;

    Ok(success_response("TOTP enabled successfully"))
  }

  pub async fn verify_login_totp(
    &self,
    username: &str,
    code: &str,
  ) -> Result<ResponseModel, ResponseModel> {
    let user = self.find_user(username).await?;

    if !user.totp_enabled {
      return Err(err_response("TOTP not enabled for this user"));
    }

    if user.totp_secret.is_empty() {
      return Err(err_response(
        "TOTP secret not found. Please setup TOTP again.",
      ));
    }

    let verified = self.verify_totp_code(&user.totp_secret, code).await;

    if !verified {
      return Err(err_response("Invalid TOTP code"));
    }

    if let Some(ref ts) = self.token_service {
      match ts.generate_token(user.id(), "", "", false) {
        Ok(token) => {
          let profile = self.check_profile_exists(user.id()).await.ok().flatten();
          let needs_profile = profile.is_none();
          return Ok(ResponseModel {
            status: ResponseStatus::Success,
            message: "TOTP verified".to_string(),
            data: DataValue::Object(serde_json::json!({
              "token": token,
              "needsProfile": needs_profile,
              "profile": profile
            })),
          });
        }
        Err(e) => return Err(e),
      }
    }

    Ok(success_response("TOTP verified"))
  }

  pub async fn disable_totp(
    &self,
    username: &str,
    code: &str,
  ) -> Result<ResponseModel, ResponseModel> {
    let user = self.find_user(username).await?;

    if !user.totp_enabled || user.totp_secret.is_empty() {
      return Err(err_response("TOTP is not enabled or not properly setup"));
    }

    if !self.verify_totp_code(&user.totp_secret, code).await {
      return Err(err_response("Invalid TOTP code"));
    }

    self
      .update_totp_settings(username, false, "", Vec::new())
      .await?;

    Ok(success_response("TOTP disabled successfully"))
  }

  pub async fn use_recovery_code(
    &self,
    username: &str,
    code: &str,
  ) -> Result<ResponseModel, ResponseModel> {
    let user = self.find_user(username).await?;

    if !user.totp_enabled {
      return Err(err_response("TOTP is not enabled"));
    }

    let mut new_recovery_codes = user.recovery_codes.clone();
    if let Some(pos) = new_recovery_codes.iter().position(|c| c == code) {
      new_recovery_codes.remove(pos);
      let updated_user = UserEntity {
        recovery_codes: new_recovery_codes,
        ..user
      };
      self.save_user(&updated_user).await?;
      Ok(success_response("Recovery code accepted"))
    } else {
      Err(err_response("Invalid recovery code"))
    }
  }

  pub async fn init_totp_qr_login(&self, username: &str) -> Result<ResponseModel, ResponseModel> {
    let user = self.find_user(username).await?;

    if !user.totp_enabled {
      return Err(err_response(
        "TOTP is not enabled for this user. Please enable TOTP in settings first.",
      ));
    }

    if user.totp_secret.is_empty() {
      return Err(err_response(
        "TOTP secret not found. Please setup TOTP first.",
      ));
    }

    let qr_code = self.generate_qr_code(&user.totp_secret, &user.email);

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "TOTP QR code generated".to_string(),
      data: DataValue::Object(serde_json::json!({
        "qr_code": qr_code,
        "secret": user.totp_secret
      })),
    })
  }

  async fn find_user(&self, username: &str) -> Result<UserEntity, ResponseModel> {
    crate::helpers::auth_helper::find_user_by_username(
      &self.json_provider,
      self.mongodb_provider.as_ref(),
      username,
    )
    .await
  }

  async fn save_user(&self, user: &UserEntity) -> Result<(), ResponseModel> {
    let user_repo_json = Repository::<UserEntity, _>::new(self.json_provider.clone());
    user_repo_json
      .update(user.clone())
      .await
      .map_err(|e| err_response_formatted("JSON update failed", &e.to_string()))?;

    if let Some(mongo) = &self.mongodb_provider {
      let user_repo_mongo =
        Repository::<UserEntity, nosql_orm::providers::MongoProvider>::new(mongo.as_ref().clone());
      user_repo_mongo
        .update(user.clone())
        .await
        .map_err(|e| err_response_formatted("Mongo update failed", &e.to_string()))?;
    }

    Ok(())
  }

  pub async fn update_totp_settings(
    &self,
    username: &str,
    totp_enabled: bool,
    totp_secret: &str,
    recovery_codes: Vec<String>,
  ) -> Result<(), ResponseModel> {
    let user = self.find_user(username).await?;

    let updated_user = UserEntity {
      totp_enabled,
      totp_secret: totp_secret.to_string(),
      recovery_codes,
      ..user
    };

    self.save_user(&updated_user).await?;

    Ok(())
  }

  pub async fn check_profile_exists(
    &self,
    user_id: &str,
  ) -> Result<Option<ProfileEntity>, ResponseModel> {
    let table_name = "profiles";
    let filter = Filter::Eq("user_id".to_string(), serde_json::json!(user_id));

    if let Ok(mut profiles) = self
      .json_provider
      .find_many(table_name, Some(&filter), None, None, None, true)
      .await
    {
      if let Some(profile_val) = profiles.pop() {
        let profile: ProfileEntity = serde_json::from_value(profile_val)
          .map_err(|e| err_response(&format!("Failed to parse profile: {}", e)))?;
        return Ok(Some(profile));
      }
    }

    if let Some(mongo) = &self.mongodb_provider {
      if let Ok(mut profiles) = mongo
        .find_many(table_name, Some(&filter), None, None, None, true)
        .await
      {
        if let Some(profile_val) = profiles.pop() {
          let profile: ProfileEntity = serde_json::from_value(profile_val)
            .map_err(|e| err_response(&format!("Failed to parse profile: {}", e)))?;
          return Ok(Some(profile));
        }
      }
    }

    Ok(None)
  }
}
