/* sys lib */
use base32::Alphabet;
use rand::Rng;
use std::sync::Arc;

/* tokio */
use tokio::time::{Duration, timeout};

/* providers */
use crate::providers::{json_provider::JsonProvider, mongodb_provider::MongodbProvider};

/* models */
use crate::models::{
  response_model::{DataValue, ResponseModel, ResponseStatus},
  user_model::UserModel,
};

/* helpers */
use crate::helpers::response_helper::{errResponse, successResponse};

/* services */
use super::auth_token::AuthTokenService;

#[derive(Clone)]
pub struct AuthTotpService {
  pub jsonProvider: JsonProvider,
  pub mongodbProvider: Option<Arc<MongodbProvider>>,
  tokenService: Option<Arc<AuthTokenService>>,
}

impl AuthTotpService {
  pub fn new(
    jsonProvider: JsonProvider,
    mongodbProvider: Option<Arc<MongodbProvider>>,
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
    let otpauth = format!("otpauth://totp/TaskFlow:{}?secret={}&issuer=TaskFlow", email, secret);
    let qr = qrcode::QrCode::new(otpauth.as_bytes()).unwrap();
    let image = qr.render::<image::Luma<u8>>().build();
    let mut png_data: Vec<u8> = Vec::new();
    let mut cursor = std::io::Cursor::new(&mut png_data);
    image::DynamicImage::ImageLuma8(image)
      .write_to(&mut cursor, image::ImageFormat::Png)
      .unwrap();
    format!("data:image/png;base64,{}", data_encoding::BASE64.encode(&png_data))
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
    eprintln!("[TOTP] Code received (after trim): '{}', length: {}", code, code.len());
    
    if code.len() != 6 {
      eprintln!("[TOTP] Code length invalid: {}", code.len());
      return false;
    }

    if !code.chars().all(|c| c.is_ascii_digit()) {
      eprintln!("[TOTP] Code contains non-digit characters");
      return false;
    }

    let secret_lower = secret.to_ascii_lowercase();
    eprintln!("[TOTP] Secret length: {}, first 4 chars: {}", secret_lower.len(), &secret_lower[..4.min(secret_lower.len())]);

    let secret_bytes = match Self::decode_base32_secret(&secret_lower) {
      Some(bytes) => {
        eprintln!("[TOTP] Decoded secret bytes length: {}", bytes.len());
        bytes
      }
      None => {
        eprintln!("[TOTP] Failed to decode base32 secret");
        return false;
      }
    };

    let totp = totp_rs::TOTP::new(
      totp_rs::Algorithm::SHA1,
      6,
      1,
      30,
      secret_bytes,
    );

    let current_time = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("Time went backwards")
        .as_secs();
    eprintln!("[TOTP] Current timestamp: {}", current_time);

    let generated = totp.generate(current_time);
    eprintln!("[TOTP] Generated code: {} | User code: {}", generated, code);
    eprintln!("[TOTP] Codes match: {}", generated == code);

    match totp.check_current(code) {
      Ok(result) => {
        eprintln!("[TOTP] Check result: {}", result);
        result
      }
      Err(e) => {
        eprintln!("[TOTP] Check error: {:?}", e);
        false
      }
    }
  }

  pub async fn setupTotp(&self, username: &str) -> Result<ResponseModel, ResponseModel> {
    let user = self.findUser(username).await?;
    
    let secret = self.generateSecret();
    let secret_lower = secret.to_ascii_lowercase();
    let recoveryCodes = self.generateRecoveryCodes();
    let qrCode = self.generateQrCode(&secret_lower, &user.email);

    let mut updatedUser = user.clone();
    updatedUser.totpSecret = secret_lower.clone();
    updatedUser.recoveryCodes = recoveryCodes;
    updatedUser.updatedAt = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);

    self.saveUser(&updatedUser).await?;

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "TOTP setup initiated".to_string(),
      data: DataValue::Object(serde_json::json!({
        "qrCode": qrCode,
        "secret": secret_lower,
        "recoveryCodes": updatedUser.recoveryCodes
      })),
    })
  }

  pub async fn enableTotp(&self, username: &str, code: &str) -> Result<ResponseModel, ResponseModel> {
    let user = self.findUser(username).await?;

    if user.totpSecret.is_empty() {
      return Err(errResponse("TOTP not setup. Please setup TOTP first."));
    }

    if !self.verifyTotpCode(&user.totpSecret, code).await {
      return Err(errResponse("Invalid TOTP code"));
    }

    let mut updatedUser = user.clone();
    updatedUser.totpEnabled = true;
    updatedUser.updatedAt = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);

    self.saveUser(&updatedUser).await?;

    Ok(successResponse("TOTP enabled successfully"))
  }

  pub async fn verifyLoginTotp(&self, username: &str, code: &str) -> Result<ResponseModel, ResponseModel> {
    let user = self.findUser(username).await?;

    if !user.totpEnabled {
      return Err(errResponse("TOTP not enabled for this user"));
    }

    if !self.verifyTotpCode(&user.totpSecret, code).await {
      return Err(errResponse("Invalid TOTP code"));
    }

    // Generate JWT token after successful TOTP verification
    if let Some(ref ts) = self.tokenService {
      match ts.generateToken(&user.id, &user.username, &user.role) {
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

  pub async fn disableTotp(&self, username: &str, code: &str) -> Result<ResponseModel, ResponseModel> {
    let user = self.findUser(username).await?;

    if !user.totpEnabled && user.totpSecret.is_empty() {
      return Err(errResponse("TOTP is not enabled"));
    }

    if !self.verifyTotpCode(&user.totpSecret, code).await {
      return Err(errResponse("Invalid TOTP code"));
    }

    let mut updatedUser = user.clone();
    updatedUser.totpEnabled = false;
    updatedUser.totpSecret = String::new();
    updatedUser.recoveryCodes = Vec::new();
    updatedUser.updatedAt = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);

    self.saveUser(&updatedUser).await?;

    Ok(successResponse("TOTP disabled successfully"))
  }

  pub async fn useRecoveryCode(&self, username: &str, code: &str) -> Result<ResponseModel, ResponseModel> {
    let user = self.findUser(username).await?;

    if !user.totpEnabled {
      return Err(errResponse("TOTP is not enabled"));
    }

    let mut updatedUser = user.clone();
    if let Some(pos) = updatedUser.recoveryCodes.iter().position(|c| c == code) {
      updatedUser.recoveryCodes.remove(pos);
      updatedUser.updatedAt = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
      self.saveUser(&updatedUser).await?;
      Ok(successResponse("Recovery code accepted"))
    } else {
      Err(errResponse("Invalid recovery code"))
    }
  }

  pub async fn initTotpQrLogin(&self, username: &str) -> Result<ResponseModel, ResponseModel> {
    let user = self.findUser(username).await?;

    if !user.totpEnabled {
      return Err(errResponse("TOTP is not enabled for this user. Please enable TOTP in settings first."));
    }

    if user.totpSecret.is_empty() {
      return Err(errResponse("TOTP secret not found. Please setup TOTP first."));
    }

    let qrCode = self.generateQrCode(&user.totpSecret, &user.email);

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "TOTP QR code generated".to_string(),
      data: DataValue::Object(serde_json::json!({
        "qrCode": qrCode,
        "secret": user.totpSecret
      })),
    })
  }

  async fn findUser(&self, username: &str) -> Result<UserModel, ResponseModel> {
    let filter = serde_json::json!({ "username": username });

    match timeout(Duration::from_secs(3), self.jsonProvider.getAll("users", Some(filter.clone()))).await {
      Ok(Ok(users)) => {
        if let Some(userVal) = users.first() {
          return serde_json::from_value(userVal.clone())
            .map_err(|e| errResponse(&format!("Failed to parse user: {}", e)));
        }
      }
      Ok(Err(e)) => {
        tracing::warn!("Local DB error: {}", e);
      }
      Err(_) => {
        tracing::warn!("Local DB timeout");
      }
    }

    let mongoProvider = self.mongodbProvider
      .as_ref()
      .ok_or_else(|| errResponse("User not found and MongoDB unavailable"))?;

    match timeout(Duration::from_secs(5), mongoProvider.getAll("users", Some(filter))).await {
      Ok(Ok(users)) => {
        let userVal = users.first()
          .ok_or_else(|| errResponse("User not found"))?;
        serde_json::from_value(userVal.clone())
          .map_err(|e| errResponse(&format!("Failed to parse user: {}", e)))
      }
      Ok(Err(e)) => Err(errResponse(&format!("Database error: {}", e))),
      Err(_) => Err(errResponse("Database timeout")),
    }
  }

  async fn saveUser(&self, user: &UserModel) -> Result<(), ResponseModel> {
    let userVal = serde_json::to_value(user)
      .map_err(|e| errResponse(&format!("Failed to serialize user: {}", e)))?;

    let userId = &user.id;

    match timeout(Duration::from_secs(3), self.jsonProvider.update("users", userId, userVal.clone())).await {
      Ok(Ok(_)) => {}
      Ok(Err(e)) => {
        tracing::warn!("Failed to update local user: {}", e);
      }
      Err(_) => {
        tracing::warn!("Local user update timed out");
      }
    }

    if let Some(mongoProvider) = &self.mongodbProvider {
      match timeout(Duration::from_secs(5), mongoProvider.update("users", userId, userVal)).await {
        Ok(Ok(_)) => {}
        Ok(Err(e)) => {
          return Err(errResponse(&format!("Failed to update MongoDB user: {}", e)));
        }
        Err(_) => {
          tracing::warn!("MongoDB update timed out, skipping");
        }
      }
    }

    Ok(())
  }
}
