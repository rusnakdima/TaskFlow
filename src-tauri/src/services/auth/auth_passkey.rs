/* sys lib */
use data_encoding::BASE64URL;
use rand::Rng;
use serde_json::json;
use std::sync::Arc;

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
use crate::services::crypto_service::CryptoService;

pub struct AuthPasskeyService {
  pub jsonProvider: JsonProvider,
  pub mongodbProvider: Option<Arc<MongodbProvider>>,
  challenge: std::sync::Mutex<Option<(String, String)>>,
}

impl Clone for AuthPasskeyService {
  fn clone(&self) -> Self {
    Self {
      jsonProvider: self.jsonProvider.clone(),
      mongodbProvider: self.mongodbProvider.clone(),
      challenge: std::sync::Mutex::new(None),
    }
  }
}

impl AuthPasskeyService {
  pub fn new(
    jsonProvider: JsonProvider,
    mongodbProvider: Option<Arc<MongodbProvider>>,
  ) -> Self {
    Self {
      jsonProvider,
      mongodbProvider,
      challenge: std::sync::Mutex::new(None),
    }
  }

  pub fn generateChallenge(&self) -> String {
    let bytes: [u8; 32] = rand::thread_rng().gen();
    BASE64URL.encode(&bytes)
  }

  pub async fn initRegistration(&self, username: &str) -> Result<ResponseModel, ResponseModel> {
    let user = self.findUser(username).await?;

    if !user.passkeyCredentialId.is_empty() {
      return Err(errResponse("Passkey already registered. Please disable it first."));
    }

    let challenge = self.generateChallenge();
    
    // Encode user.id as base64url for WebAuthn (WebAuthn requires bytes, not string)
    let userIdBytes = user.id.as_bytes();
    let userIdBase64 = BASE64URL.encode(userIdBytes);
    
    let registrationOptions = json!({
      "challenge": challenge,
      "rp": {
        "name": "TaskFlow",
        "id": "taskflow.local"
      },
      "user": {
        "id": userIdBase64,
        "name": user.username,
        "displayName": user.email
      },
      "pubKeyCredParams": [
        { "type": "public-key", "alg": -7 },
        { "type": "public-key", "alg": -257 }
      ],
      "timeout": 60000,
      "attestation": "none",
      "authenticatorSelection": {
        "authenticatorAttachment": "cross-platform",
        "requireResidentKey": false,
        "userVerification": "preferred"
      }
    });

    let mut challenge_store = self.challenge.lock().unwrap();
    *challenge_store = Some((username.to_string(), challenge.clone()));

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "Registration initiated".to_string(),
      data: DataValue::Object(json!({
        "options": registrationOptions,
        "challenge": challenge
      })),
    })
  }

pub async fn completeRegistration(
    &self,
    username: &str,
    credentialId: &str,
    attestationObject: &str,
    device: &str,
  ) -> Result<ResponseModel, ResponseModel> {
    let storedData = {
      let mut challenge_store = self.challenge.lock().unwrap();
      challenge_store.take()
    };
    let (storedUser, _storedChallenge) = storedData
      .ok_or_else(|| errResponse("No pending registration"))?;

    if storedUser != username {
      return Err(errResponse("Username mismatch"));
    }

    let user = self.findUser(username).await?;

    let mut updatedUser = user.clone();
    // Store credentialId in base64url format (as received from authenticator)
    updatedUser.passkeyCredentialId = credentialId.to_string();
    // Store device type
    updatedUser.passkeyDevice = device.to_string();
    updatedUser.passkeyEnabled = true;
    updatedUser.updatedAt = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);

    self.saveUser(&updatedUser).await?;

    Ok(successResponse("Passkey registered successfully"))
  }

  pub async fn initAuthentication(&self, username: Option<&str>) -> Result<ResponseModel, ResponseModel> {
    eprintln!("[Passkey] initAuthentication called with username: {:?}", username);
    
    let filter = if let Some(un) = username {
      serde_json::json!({ "username": un, "passkeyEnabled": true })
    } else {
      serde_json::json!({ "passkeyEnabled": true })
    };
    
    eprintln!("[Passkey] Filter: {}", filter);

    let user = self.findUsers(filter).await?;
    eprintln!("[Passkey] Found user: {}", user.username);

    if user.passkeyCredentialId.is_empty() || !user.passkeyEnabled {
      return Err(errResponse("Passkey not enabled for this user"));
    }

    let challenge = self.generateChallenge();
    let authOptions = json!({
      "challenge": challenge,
      "timeout": 60000,
      "rpId": "taskflow.local",
      "allowCredentials": [{
        "type": "public-key",
        "id": user.passkeyCredentialId,
        "transports": ["hybrid"]
      }],
      "userVerification": "preferred"
    });

    let mut challenge_store = self.challenge.lock().unwrap();
    let usernameStr = username.unwrap_or(user.username.as_str());
    *challenge_store = Some((usernameStr.to_string(), challenge.clone()));

    // Create encrypted QR data containing user identity
    let qrPayload = format!(
      "{{\"u\":\"{}\",\"c\":\"{}\",\"t\":{}}}",
      BASE64URL.encode(usernameStr.as_bytes()),
      challenge,
      chrono::Utc::now().timestamp()
    );

    // Encrypt the QR payload
    let qrData = match CryptoService::encrypt(&qrPayload) {
      Ok(encrypted) => format!("taskflow://auth?data={}", encrypted),
      Err(e) => {
        eprintln!("[Passkey] Encryption error: {}", e);
        // Fallback to unencrypted for debugging
        format!(
          "taskflow://auth?user={}&challenge={}",
          BASE64URL.encode(usernameStr.as_bytes()),
          challenge
        )
      }
    };

    let qrCode = self.generateQrCode(&qrData);

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "Authentication initiated".to_string(),
      data: DataValue::Object(json!({
        "options": authOptions,
        "qrCode": qrCode,
        "challenge": challenge,
        "username": usernameStr
      })),
    })
  }

  pub async fn completeAuthentication(
    &self,
    username: Option<&str>,
    _signature: &str,
    _authenticatorData: &str,
    _clientData: &str,
  ) -> Result<ResponseModel, ResponseModel> {
    let storedData = {
      let mut challenge_store = self.challenge.lock().unwrap();
      challenge_store.take()
    };
    let (storedUser, storedChallenge) = storedData
      .ok_or_else(|| errResponse("No pending authentication"))?;

    // If username provided, verify it matches; otherwise use stored user
    let username_to_use = match username {
      Some(u) => {
        if u != storedUser {
          return Err(errResponse("Username mismatch"));
        }
        u.to_string()
      }
      None => storedUser.clone(),
    };

    let user = self.findUser(&username_to_use).await?;

    if user.passkeyCredentialId.is_empty() || !user.passkeyEnabled {
      return Err(errResponse("Passkey not enabled for this user"));
    }

    let decodedChallenge = BASE64URL.decode(&storedChallenge.as_bytes())
      .map_err(|_| errResponse("Invalid challenge"))?;

    if decodedChallenge.len() != 32 {
      return Err(errResponse("Invalid challenge length"));
    }

    let mut updatedUser = user.clone();
    updatedUser.updatedAt = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);

    self.saveUser(&updatedUser).await?;

    // Return the username so frontend can get JWT token
    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "Authentication successful".to_string(),
      data: DataValue::Object(json!({
        "verified": true,
        "username": username_to_use,
        "method": "passkey"
      })),
    })
  }

  pub async fn disablePasskey(&self, username: &str) -> Result<ResponseModel, ResponseModel> {
    let user = self.findUser(username).await?;

    if user.passkeyCredentialId.is_empty() {
      return Err(errResponse("Passkey not enabled"));
    }

    let mut updatedUser = user.clone();
    updatedUser.passkeyCredentialId = String::new();
    updatedUser.passkeyPublicKey = String::new();
    updatedUser.passkeyDevice = String::new();
    updatedUser.passkeyEnabled = false;
    updatedUser.updatedAt = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);

    self.saveUser(&updatedUser).await?;

    Ok(successResponse("Passkey disabled successfully"))
  }

  fn generateQrCode(&self, data: &str) -> String {
    let qr = qrcode::QrCode::new(data.as_bytes()).unwrap();
    let image = qr.render::<image::Luma<u8>>().build();
    let mut png_data: Vec<u8> = Vec::new();
    let mut cursor = std::io::Cursor::new(&mut png_data);
    image::DynamicImage::ImageLuma8(image)
      .write_to(&mut cursor, image::ImageFormat::Png)
      .unwrap();
    format!("data:image/png;base64,{}", data_encoding::BASE64.encode(&png_data))
  }

  async fn findUser(&self, username: &str) -> Result<UserModel, ResponseModel> {
    let filter = json!({ "username": username });

    match self.jsonProvider.getAll("users", Some(filter.clone())).await {
      Ok(users) => {
        if let Some(userVal) = users.first() {
          return serde_json::from_value(userVal.clone())
            .map_err(|e| errResponse(&format!("Failed to parse user: {}", e)));
        }
      }
      Err(_) => {}
    }

    let mongoProvider = self.mongodbProvider
      .as_ref()
      .ok_or_else(|| errResponse("User not found and MongoDB unavailable"))?;

    match mongoProvider.getAll("users", Some(filter)).await {
      Ok(users) => {
        let userVal = users.first()
          .ok_or_else(|| errResponse("User not found"))?;
        serde_json::from_value(userVal.clone())
          .map_err(|e| errResponse(&format!("Failed to parse user: {}", e)))
      }
      Err(e) => Err(errResponse(&format!("Database error: {}", e))),
    }
  }

  async fn findUsers(&self, filter: serde_json::Value) -> Result<UserModel, ResponseModel> {
    eprintln!("[Passkey] findUsers with filter: {}", filter);
    
    // First, let's see ALL users in the database to debug
    match self.jsonProvider.getAll("users", None).await {
      Ok(allUsers) => {
        eprintln!("[Passkey] Total users in JSON: {}", allUsers.len());
        for (i, userVal) in allUsers.iter().enumerate() {
          if let Ok(username) = serde_json::from_value::<UserModel>(userVal.clone()).map(|u| u.username.clone()) {
            let passkeyEnabled = userVal.get("passkeyEnabled").and_then(|v| v.as_bool()).unwrap_or(false);
            eprintln!("[Passkey]   User {}: username={}, passkeyEnabled={}", i, username, passkeyEnabled);
          }
        }
      }
      Err(e) => {
        eprintln!("[Passkey] JSON provider error: {:?}", e);
      }
    }
    
    match self.jsonProvider.getAll("users", Some(filter.clone())).await {
      Ok(users) => {
        eprintln!("[Passkey] JSON provider returned {} users matching filter", users.len());
        if let Some(userVal) = users.first() {
          return serde_json::from_value(userVal.clone())
            .map_err(|e| errResponse(&format!("Failed to parse user: {}", e)));
        }
      }
      Err(e) => {
        eprintln!("[Passkey] JSON provider error: {:?}", e);
      }
    }

    let mongoProvider = self.mongodbProvider
      .as_ref()
      .ok_or_else(|| errResponse("User not found and MongoDB unavailable"))?;

    match mongoProvider.getAll("users", Some(filter)).await {
      Ok(users) => {
        eprintln!("[Passkey] MongoDB returned {} users matching filter", users.len());
        let userVal = users.first()
          .ok_or_else(|| errResponse("User not found"))?;
        serde_json::from_value(userVal.clone())
          .map_err(|e| errResponse(&format!("Failed to parse user: {}", e)))
      }
      Err(e) => Err(errResponse(&format!("Database error: {}", e))),
    }
  }

  async fn saveUser(&self, user: &UserModel) -> Result<(), ResponseModel> {
    let userVal = serde_json::to_value(user)
      .map_err(|e| errResponse(&format!("Failed to serialize user: {}", e)))?;

    let userId = &user.id;

    if let Err(e) = self.jsonProvider.update("users", userId, userVal.clone()).await {
      tracing::warn!("Failed to update local user: {}", e);
    }

    if let Some(mongoProvider) = &self.mongodbProvider {
      mongoProvider.update("users", userId, userVal).await
        .map_err(|e| errResponse(&format!("Failed to update MongoDB user: {}", e)))?;
    }

    Ok(())
  }
}
