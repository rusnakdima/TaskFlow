/* sys lib */
use base32::Alphabet;
use rand::Rng;
use std::sync::Arc;

/* tokio */
use tokio::time::{timeout, Duration};

/* providers */
use nosql_orm::provider::DatabaseProvider;
use nosql_orm::providers::JsonProvider;
use nosql_orm::providers::MongoProvider;
use nosql_orm::query::Filter;

/* models */
use crate::entities::{
  profile_entity::ProfileEntity,
  response_entity::{DataValue, ResponseModel, ResponseStatus},
  table_entity::TableModelType,
  user_entity::UserEntity,
};

/* helpers */
use crate::helpers::response_helper::{err_response, success_response};

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
    let qr = qrcode::QrCode::new(otpauth.as_bytes()).unwrap();
    let image = qr.render::<image::Luma<u8>>().build();
    let mut png_data: Vec<u8> = Vec::new();
    let mut cursor = std::io::Cursor::new(&mut png_data);
    image::DynamicImage::ImageLuma8(image)
      .write_to(&mut cursor, image::ImageFormat::Png)
      .unwrap();
    format!(
      "data:image/png;base64,{}",
      data_encoding::BASE64.encode(&png_data)
    )
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
    tracing::debug!("TOTP code received: length={}", code.len());

    if code.len() != 6 {
      tracing::debug!("TOTP code length invalid: {}", code.len());
      return false;
    }

    if !code.chars().all(|c| c.is_ascii_digit()) {
      tracing::debug!("TOTP code contains non-digit characters");
      return false;
    }

    let secret_lower = secret.to_ascii_lowercase();
    tracing::debug!(
      "TOTP secret length: {}, first 4 chars: {}",
      secret_lower.len(),
      if secret_lower.len() >= 4 {
        &secret_lower[..4]
      } else {
        &secret_lower
      }
    );

    let secret_bytes = match Self::decode_base32_secret(&secret_lower) {
      Some(bytes) => {
        tracing::debug!("TOTP decoded secret bytes length: {}", bytes.len());
        bytes
      }
      None => {
        tracing::warn!(
          "TOTP failed to decode base32 secret, secret was: {}...",
          secret_lower.chars().take(4).collect::<String>()
        );
        return false;
      }
    };

    let totp = totp_rs::TOTP::new(totp_rs::Algorithm::SHA1, 6, 1, 30, secret_bytes);

    let current_time = std::time::SystemTime::now()
      .duration_since(std::time::UNIX_EPOCH)
      .map(|d| d.as_secs())
      .unwrap_or(0);
    tracing::debug!("TOTP current timestamp: {}", current_time);

    let generated = totp.generate(current_time);
    tracing::debug!(
      "TOTP generated code vs user code: {} vs {}",
      generated,
      code
    );

    let time_step = current_time / 30;
    tracing::debug!("TOTP time step: {}", time_step);

    for offset in [-1i32, 0, 1].iter() {
      let check_time = ((time_step as i64) + (*offset as i64)) * 30;
      let generated = totp.generate(check_time as u64);
      tracing::debug!(
        "TOTP generated code at offset {}: {} vs user code: {}",
        offset,
        generated,
        code
      );
      if generated == code {
        tracing::info!("TOTP verified successfully with offset {}", offset);
        return true;
      }
    }

    tracing::warn!("TOTP code did not match any time step");
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

    tracing::info!(
      "verify_login_totp: username={}, totp_enabled={}, totp_secret.len={}, totp_secret.prefix={}",
      username,
      user.totp_enabled,
      user.totp_secret.len(),
      if user.totp_secret.len() >= 4 {
        &user.totp_secret[..4]
      } else {
        &user.totp_secret
      }
    );

    if !user.totp_enabled {
      return Err(err_response("TOTP not enabled for this user"));
    }

    if user.totp_secret.is_empty() {
      tracing::warn!(
        "verify_login_totp: totp_secret is empty for user {}",
        username
      );
      return Err(err_response(
        "TOTP secret not found. Please setup TOTP again.",
      ));
    }

    tracing::info!(
      "verify_login_totp: calling verify_totp_code with secret.len={}",
      user.totp_secret.len()
    );
    let verified = self.verify_totp_code(&user.totp_secret, code).await;
    tracing::info!("verify_login_totp: verify_totp_code returned {}", verified);

    if !verified {
      return Err(err_response("Invalid TOTP code"));
    }

    if let Some(ref ts) = self.token_service {
      match ts.generate_token(user.id(), "", "") {
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

    let mut updated_user = user.clone();
    if let Some(pos) = updated_user.recovery_codes.iter().position(|c| c == code) {
      updated_user.recovery_codes.remove(pos);
      updated_user.updated_at = Some(chrono::Utc::now());
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
    let table_name = TableModelType::User.table_name();
    let filter = Filter::Eq("username".to_string(), serde_json::json!(username));

    let user_val = match timeout(
      Duration::from_secs(3),
      self
        .json_provider
        .find_many(table_name, Some(&filter), None, None, None, true),
    )
    .await
    {
      Ok(Ok(mut users)) => {
        if users.is_empty() {
          None
        } else {
          Some(users.remove(0))
        }
      }
      Ok(Err(_)) => None,
      Err(_) => {
        tracing::warn!("Local DB timeout");
        None
      }
    };

    let user_val = match user_val {
      Some(v) => v,
      None => {
        let mongo = self
          .mongodb_provider
          .as_ref()
          .ok_or_else(|| err_response("User not found and MongoDB unavailable"))?;
        let mut users = timeout(
          Duration::from_secs(5),
          mongo.find_many(table_name, Some(&filter), None, None, None, true),
        )
        .await
        .map_err(|_| err_response("Database timeout"))?
        .map_err(|e| err_response(&format!("Database error: {}", e)))?;
        users.pop().ok_or_else(|| err_response("User not found"))?
      }
    };

    serde_json::from_value::<UserEntity>(user_val)
      .map_err(|e| err_response(&format!("Failed to parse user: {}", e)))
  }

  async fn save_user(&self, user: &UserEntity) -> Result<(), ResponseModel> {
    let user_val = serde_json::to_value(user)
      .map_err(|e| err_response(&format!("Failed to serialize user: {}", e)))?;

    let user_id = user.id();
    let table_name = TableModelType::User.table_name();

    match timeout(
      Duration::from_secs(3),
      self
        .json_provider
        .update(table_name, user_id, user_val.clone()),
    )
    .await
    {
      Ok(Ok(_)) => {}
      Ok(Err(e)) => {
        tracing::warn!("Failed to update local user: {}", e);
      }
      Err(_) => {
        tracing::warn!("Local user update timed out");
      }
    }

    if let Some(mongo) = &self.mongodb_provider {
      match timeout(
        Duration::from_secs(5),
        mongo.update(table_name, user_id, user_val),
      )
      .await
      {
        Ok(Ok(_)) => {}
        Ok(Err(e)) => {
          return Err(err_response(&format!(
            "Failed to update MongoDB user: {}",
            e
          )));
        }
        Err(_) => {
          tracing::warn!("MongoDB update timed out, skipping");
        }
      }
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
    tracing::info!(
      "update_totp_settings: username={}, totp_enabled={}, totp_secret.len={}, totp_secret.prefix={}",
      username,
      totp_enabled,
      totp_secret.len(),
      if totp_secret.len() >= 4 {
        &totp_secret[..4]
      } else {
        totp_secret
      }
    );

    let user = self.find_user(username).await?;
    tracing::info!("update_totp_settings: found user with id={}", user.id());

    let mut updated_user = user.clone();
    updated_user.totp_enabled = totp_enabled;
    updated_user.totp_secret = totp_secret.to_string();
    updated_user.recovery_codes = recovery_codes;
    updated_user.updated_at = Some(chrono::Utc::now());

    self.save_user(&updated_user).await?;

    if let Some(mongo_provider) = &self.mongodb_provider {
      match timeout(
        Duration::from_secs(5),
        mongo_provider.update(
          "users",
          updated_user.id(),
          serde_json::to_value(&updated_user).unwrap(),
        ),
      )
      .await
      {
        Ok(Ok(_)) => {
          tracing::info!("update_totp_settings: MongoDB update completed");
        }
        Ok(Err(e)) => {
          tracing::warn!("Failed to update MongoDB TOTP settings: {}", e);
        }
        Err(_) => {
          tracing::warn!("MongoDB TOTP update timed out, skipping");
        }
      }
    } else {
      tracing::warn!("update_totp_settings: no MongoDB provider available");
    }

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
