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
  response_entity::{DataValue, ResponseModel, ResponseStatus},
  table_entity::TableModelType,
  user_entity::UserEntity,
};

/* helpers */
use crate::helpers::response_helper::{errResponse, successResponse};

/* services */
use super::auth_token::AuthTokenService;

#[derive(Clone)]
pub struct AuthTotpService {
  pub jsonProvider: JsonProvider,
  pub mongodbProvider: Option<Arc<MongoProvider>>,
  tokenService: Option<Arc<AuthTokenService>>,
}

impl AuthTotpService {
  pub fn new(
    jsonProvider: JsonProvider,
    mongodbProvider: Option<Arc<MongoProvider>>,
    tokenService: Option<Arc<AuthTokenService>>,
  ) -> Self {
    Self {
      jsonProvider,
      mongodbProvider,
      tokenService,
    }
  }

  pub fn generateSecret(&self) -> String {
    let secret: [u8; 20] = rand::thread_rng().gen();
    base32::encode(Alphabet::Rfc4648 { padding: false }, &secret).to_ascii_lowercase()
  }

  pub fn generateQrCode(&self, secret: &str, email: &str) -> String {
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

  pub fn generateRecoveryCodes(&self) -> Vec<String> {
    let mut codes = Vec::new();
    for _ in 0..8 {
      let code: u32 = rand::thread_rng().gen();
      codes.push(format!("{:06}", code % 1000000));
    }
    codes
  }

  pub async fn verifyTotpCode(&self, secret: &str, code: &str) -> bool {
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
      .expect("Time went backwards")
      .as_secs();
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

  pub async fn setupTotp(&self, username: &str) -> Result<ResponseModel, ResponseModel> {
    let user = self.findUser(username).await?;

    let secret = self.generateSecret();
    let secret_lower = secret.to_ascii_lowercase();
    let recoveryCodes = self.generateRecoveryCodes();
    let qrCode = self.generateQrCode(&secret_lower, &user.email);

    self
      .updateTotpSettings(username, false, &secret_lower, recoveryCodes.clone())
      .await?;

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "TOTP setup initiated".to_string(),
      data: DataValue::Object(serde_json::json!({
        "qrCode": qrCode,
        "secret": secret_lower,
        "recoveryCodes": recoveryCodes
      })),
    })
  }

  pub async fn enableTotp(
    &self,
    username: &str,
    code: &str,
  ) -> Result<ResponseModel, ResponseModel> {
    let user = self.findUser(username).await?;

    if user.totp_secret.is_empty() {
      return Err(errResponse("TOTP not setup. Please setup TOTP first."));
    }

    if !self.verifyTotpCode(&user.totp_secret, code).await {
      return Err(errResponse("Invalid TOTP code"));
    }

    self
      .updateTotpSettings(username, true, &user.totp_secret, user.recovery_codes.clone())
      .await?;

    Ok(successResponse("TOTP enabled successfully"))
  }

  pub async fn verifyLoginTotp(
    &self,
    username: &str,
    code: &str,
  ) -> Result<ResponseModel, ResponseModel> {
    let user = self.findUser(username).await?;

    tracing::info!(
      "verifyLoginTotp: username={}, totpEnabled={}, totpSecret.len={}, totpSecret.prefix={}",
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
      return Err(errResponse("TOTP not enabled for this user"));
    }

    if user.totp_secret.is_empty() {
      tracing::warn!("verifyLoginTotp: totpSecret is empty for user {}", username);
      return Err(errResponse(
        "TOTP secret not found. Please setup TOTP again.",
      ));
    }

    tracing::info!(
      "verifyLoginTotp: calling verifyTotpCode with secret.len={}",
      user.totp_secret.len()
    );
    let verified = self.verifyTotpCode(&user.totp_secret, code).await;
    tracing::info!("verifyLoginTotp: verifyTotpCode returned {}", verified);

    if !verified {
      return Err(errResponse("Invalid TOTP code"));
    }

    // Generate JWT token after successful TOTP verification
    if let Some(ref ts) = self.tokenService {
      match ts.generateToken(&user.get_id(), &user.username, &user.role) {
        Ok(token) => {
          return Ok(ResponseModel {
            status: ResponseStatus::Success,
            message: "TOTP verified".to_string(),
            data: DataValue::String(token),
          });
        }
        Err(e) => return Err(e),
      }
    }

    // Fallback if no token service
    Ok(successResponse("TOTP verified"))
  }

  pub async fn disableTotp(
    &self,
    username: &str,
    code: &str,
  ) -> Result<ResponseModel, ResponseModel> {
    let user = self.findUser(username).await?;

    if !user.totp_enabled || user.totp_secret.is_empty() {
      return Err(errResponse("TOTP is not enabled or not properly setup"));
    }

    if !self.verifyTotpCode(&user.totp_secret, code).await {
      return Err(errResponse("Invalid TOTP code"));
    }

    self
      .updateTotpSettings(username, false, "", Vec::new())
      .await?;

    Ok(successResponse("TOTP disabled successfully"))
  }

  pub async fn useRecoveryCode(
    &self,
    username: &str,
    code: &str,
  ) -> Result<ResponseModel, ResponseModel> {
    let user = self.findUser(username).await?;

    if !user.totp_enabled {
      return Err(errResponse("TOTP is not enabled"));
    }

    let mut updatedUser = user.clone();
    if let Some(pos) = updatedUser.recovery_codes.iter().position(|c| c == code) {
      updatedUser.recovery_codes.remove(pos);
      updatedUser.updated_at = chrono::Utc::now();
      self.saveUser(&updatedUser).await?;
      Ok(successResponse("Recovery code accepted"))
    } else {
      Err(errResponse("Invalid recovery code"))
    }
  }

  pub async fn initTotpQrLogin(&self, username: &str) -> Result<ResponseModel, ResponseModel> {
    let user = self.findUser(username).await?;

    if !user.totp_enabled {
      return Err(errResponse(
        "TOTP is not enabled for this user. Please enable TOTP in settings first.",
      ));
    }

    if user.totp_secret.is_empty() {
      return Err(errResponse(
        "TOTP secret not found. Please setup TOTP first.",
      ));
    }

    let qrCode = self.generateQrCode(&user.totp_secret, &user.email);

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "TOTP QR code generated".to_string(),
      data: DataValue::Object(serde_json::json!({
        "qrCode": qrCode,
        "secret": user.totp_secret
      })),
    })
  }

  async fn findUser(&self, username: &str) -> Result<UserEntity, ResponseModel> {
    let table_name = TableModelType::User.table_name();
    let filter = Filter::Eq("username".to_string(), serde_json::json!(username));

    let user_val = match timeout(
      Duration::from_secs(3),
      self
        .jsonProvider
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
          .mongodbProvider
          .as_ref()
          .ok_or_else(|| errResponse("User not found and MongoDB unavailable"))?;
        let mut users = timeout(
          Duration::from_secs(5),
          mongo.find_many(table_name, Some(&filter), None, None, None, true),
        )
        .await
        .map_err(|_| errResponse("Database timeout"))?
        .map_err(|e| errResponse(&format!("Database error: {}", e)))?;
        users.pop().ok_or_else(|| errResponse("User not found"))?
      }
    };

    serde_json::from_value::<UserEntity>(user_val)
      .map_err(|e| errResponse(&format!("Failed to parse user: {}", e)))
  }

  async fn saveUser(&self, user: &UserEntity) -> Result<(), ResponseModel> {
    let user_val = serde_json::to_value(user)
      .map_err(|e| errResponse(&format!("Failed to serialize user: {}", e)))?;

    let user_id = user.get_id();
    let table_name = TableModelType::User.table_name();

    match timeout(
      Duration::from_secs(3),
      self
        .jsonProvider
        .update(table_name, &user_id, user_val.clone()),
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

    if let Some(mongo) = &self.mongodbProvider {
      match timeout(
        Duration::from_secs(5),
        mongo.update(table_name, &user_id, user_val),
      )
      .await
      {
        Ok(Ok(_)) => {}
        Ok(Err(e)) => {
          return Err(errResponse(&format!(
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

  pub async fn updateTotpSettings(
    &self,
    username: &str,
    totpEnabled: bool,
    totpSecret: &str,
    recoveryCodes: Vec<String>,
  ) -> Result<(), ResponseModel> {
    tracing::info!(
      "updateTotpSettings: username={}, totpEnabled={}, totpSecret.len={}, totpSecret.prefix={}",
      username,
      totpEnabled,
      totpSecret.len(),
      if totpSecret.len() >= 4 {
        &totpSecret[..4]
      } else {
        totpSecret
      }
    );

    let user = self.findUser(username).await?;
    tracing::info!("updateTotpSettings: found user with id={}", user.get_id());

    let mut updatedUser = user.clone();
    updatedUser.totp_enabled = totpEnabled;
    updatedUser.totp_secret = totpSecret.to_string();
    updatedUser.recovery_codes = recoveryCodes;
    updatedUser.updated_at = chrono::Utc::now();

    self.saveUser(&updatedUser).await?;

    if let Some(mongoProvider) = &self.mongodbProvider {
      match timeout(
        Duration::from_secs(5),
        mongoProvider.update(
          "users",
          &updatedUser.get_id(),
          serde_json::to_value(&updatedUser).unwrap(),
        ),
      )
      .await
      {
        Ok(Ok(_)) => {
          tracing::info!("updateTotpSettings: MongoDB update completed");
        }
        Ok(Err(e)) => {
          tracing::warn!("Failed to update MongoDB TOTP settings: {}", e);
        }
        Err(_) => {
          tracing::warn!("MongoDB TOTP update timed out, skipping");
        }
      }
    } else {
      tracing::warn!("updateTotpSettings: no MongoDB provider available");
    }

    Ok(())
  }
}
