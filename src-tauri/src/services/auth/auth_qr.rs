use data_encoding::BASE64URL;
use rand::Rng;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Arc;

use super::auth_token::AuthTokenService;
use crate::entities::{
  response_entity::{DataValue, ResponseModel, ResponseStatus},
  user_entity::UserEntity,
};
use crate::helpers::response_helper::{errResponse, successResponse};
use nosql_orm::provider::DatabaseProvider;
use nosql_orm::providers::JsonProvider;
use nosql_orm::providers::MongoProvider;

const QR_TOKEN_TTL_SECS: i64 = 90;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QrToken {
  pub id: String,
  pub username: Option<String>,
  pub created_at: i64,
  pub expires_at: i64,
  pub approved: bool,
  pub approved_at: Option<i64>,
  pub approved_by: Option<String>,
}

pub struct QrAuthService {
  jsonProvider: JsonProvider,
  mongodbProvider: Option<Arc<MongoProvider>>,
  tokenService: Arc<AuthTokenService>,
}

impl Clone for QrAuthService {
  fn clone(&self) -> Self {
    Self {
      jsonProvider: self.jsonProvider.clone(),
      mongodbProvider: self.mongodbProvider.clone(),
      tokenService: self.tokenService.clone(),
    }
  }
}

impl QrAuthService {
  pub fn new(
    jsonProvider: JsonProvider,
    mongodbProvider: Option<Arc<MongoProvider>>,
    tokenService: Arc<AuthTokenService>,
  ) -> Self {
    Self {
      jsonProvider,
      mongodbProvider,
      tokenService,
    }
  }

  pub async fn generateQrToken(
    &self,
    username: Option<&str>,
  ) -> Result<ResponseModel, ResponseModel> {
    let token = self.generateToken();
    let now = chrono::Utc::now().timestamp();

    let qr_token = QrToken {
      id: token.clone(),
      username: username.map(|s| s.to_string()),
      created_at: now,
      expires_at: now + QR_TOKEN_TTL_SECS,
      approved: false,
      approved_at: None,
      approved_by: None,
    };

    let qr_token_json = serde_json::to_value(&qr_token)
      .map_err(|e| errResponse(&format!("Failed to serialize token: {}", e)))?;

    // QR login is cross-device, so MongoDB is primary store
    eprintln!("[QR] Attempting to store token in MongoDB first...");
    if let Some(ref mongoProvider) = self.mongodbProvider {
      match mongoProvider
        .insert("qr_tokens", qr_token_json.clone())
        .await
      {
        Ok(_) => {
          eprintln!("[QR] Successfully stored token in MongoDB");
        }
        Err(e) => {
          eprintln!("[QR] Failed to store token in MongoDB: {}", e);
        }
      }
    } else {
      eprintln!("[QR] MongoDB provider not available!");
    }

    // Cache to local JSON DB
    eprintln!("[QR] Attempting to store token in local DB...");
    match self
      .jsonProvider
      .insert("qr_tokens", qr_token_json.clone())
      .await
    {
      Ok(result) => {
        eprintln!(
          "[QR] Successfully stored token in local DB, result: {}",
          result
        );
      }
      Err(e) => {
        eprintln!("[QR] Failed to store token in local DB: {}", e);
      }
    }

    eprintln!("[QR] Generated and stored token: '{}'", token);

    let qr_payload = format!("{{\"t\":\"{}\",\"ts\":{}}}", token, now);

    let qr_data = format!("taskflow://qrlogin?data={}", qr_payload);

    let qr_code = self.generateQrCodeImage(&qr_data);

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "QR code generated".to_string(),
      data: DataValue::Object(json!({
          "token": token,
          "qrCode": qr_code,
          "expiresAt": now + QR_TOKEN_TTL_SECS
      })),
    })
  }

  pub async fn approveQrToken(
    &self,
    token: &str,
    approving_username: &str,
  ) -> Result<ResponseModel, ResponseModel> {
    eprintln!(
      "[QR] approveQrToken called with token: '{}', username: '{}'",
      token, approving_username
    );

    let qr_token = self.findQrToken(token).await?;
    eprintln!("[QR] Token found, approved={}", qr_token.approved);

    if qr_token.approved {
      return Err(errResponse("QR code already approved"));
    }

    if qr_token.expires_at < chrono::Utc::now().timestamp() {
      return Err(errResponse("QR code has expired"));
    }

    let now = chrono::Utc::now().timestamp();

    let mut updated_token = qr_token.clone();
    updated_token.approved = true;
    updated_token.approved_at = Some(now);
    updated_token.approved_by = Some(approving_username.to_string());
    updated_token.username = Some(approving_username.to_string());

    self.saveQrToken(&updated_token).await?;

    eprintln!(
      "[QR] Token approved by {} for user {}",
      approving_username, approving_username
    );

    Ok(successResponse("QR code approved"))
  }

  pub async fn getQrStatus(&self, token: &str) -> Result<ResponseModel, ResponseModel> {
    eprintln!("[QR] getQrStatus called with token: '{}'", token);

    match self.findQrToken(token).await {
      Ok(qr_token) => {
        let now = chrono::Utc::now().timestamp();
        let status = if qr_token.approved {
          "approved"
        } else if qr_token.expires_at < now {
          "expired"
        } else {
          "pending"
        };

        let mut response_data = json!({
            "status": status,
        });

        if let Some(ref username) = qr_token.username {
          response_data["username"] = json!(username);
        }

        if let Some(ref approved_by) = qr_token.approved_by {
          response_data["approvedBy"] = json!(approved_by);
        }

        Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: "Status retrieved".to_string(),
          data: DataValue::Object(response_data),
        })
      }
      Err(_) => Ok(ResponseModel {
        status: ResponseStatus::Success,
        message: "Status retrieved".to_string(),
        data: DataValue::Object(json!({
            "status": "expired"
        })),
      }),
    }
  }

  pub async fn toggleQrLogin(
    &self,
    username: &str,
    enabled: bool,
  ) -> Result<ResponseModel, ResponseModel> {
    eprintln!("[QR] toggleQrLogin called for {}: {}", username, enabled);
    Ok(successResponse(if enabled {
      "QR login enabled"
    } else {
      "QR login disabled"
    }))
  }

  fn generateToken(&self) -> String {
    let bytes: [u8; 32] = rand::thread_rng().gen();
    BASE64URL.encode(&bytes)
  }

  fn generateQrCodeImage(&self, data: &str) -> String {
    let qr = qrcode::QrCode::new(data.as_bytes()).unwrap();
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

  async fn findQrToken(&self, token: &str) -> Result<QrToken, ResponseModel> {
    eprintln!("[QR] Searching for token: '{}'", token);

    // QR login is cross-device, so check MongoDB first (shared state)
    eprintln!("[QR] Searching in MongoDB first...");
    if let Some(ref mongoProvider) = self.mongodbProvider {
      match mongoProvider.find_all("qr_tokens").await {
        Ok(results) => {
          eprintln!("[QR] MongoDB returned {} results", results.len());
          for token_val in results {
            if let Ok(t) = serde_json::from_value::<QrToken>(token_val.clone()) {
              if t.id == token {
                eprintln!("[QR] Found token in MongoDB");
                return Ok(t);
              }
            }
          }
        }
        Err(e) => {
          eprintln!("[QR] Error reading from MongoDB: {}", e);
        }
      }
    } else {
      eprintln!("[QR] MongoDB provider not available, falling back to local DB");
    }

    // Fallback to local JSON DB
    eprintln!("[QR] Searching in local JSON DB...");
    match self.jsonProvider.find_all("qr_tokens").await {
      Ok(results) => {
        eprintln!("[QR] Local DB returned {} results", results.len());
        for token_val in results {
          if let Ok(t) = serde_json::from_value::<QrToken>(token_val.clone()) {
            if t.id == token {
              eprintln!("[QR] Found token in local DB");
              return Ok(t);
            }
          }
        }
      }
      Err(e) => {
        eprintln!("[QR] Error reading from local DB: {}", e);
      }
    }

    eprintln!("[QR] Token not found in either store");
    Err(errResponse("Token not found"))
  }

  async fn saveQrToken(&self, token: &QrToken) -> Result<(), ResponseModel> {
    let token_val = serde_json::to_value(token)
      .map_err(|e| errResponse(&format!("Failed to serialize token: {}", e)))?;

    // QR login is cross-device, so MongoDB is primary store
    if let Some(ref mongoProvider) = self.mongodbProvider {
      if let Err(e) = mongoProvider
        .update("qr_tokens", &token.id, token_val.clone())
        .await
      {
        eprintln!("[QR] Failed to update token in MongoDB: {}", e);
      }
    }

    // Also update local cache
    if let Err(e) = self
      .jsonProvider
      .update("qr_tokens", &token.id, token_val)
      .await
    {
      eprintln!("[QR] Failed to update token in local DB: {}", e);
    }

    Ok(())
  }

  /// Complete QR login: generate a JWT token for the approved user
  pub async fn completeQrLogin(&self, token: &str) -> Result<ResponseModel, ResponseModel> {
    eprintln!("[QR] completeQrLogin called with token: '{}'", token);

    // Verify QR token is approved
    let qr_token = self.findQrToken(token).await?;

    if !qr_token.approved {
      return Err(errResponse("QR code not yet approved"));
    }

    if qr_token.expires_at < chrono::Utc::now().timestamp() {
      return Err(errResponse("QR code has expired"));
    }

    let username = qr_token
      .username
      .ok_or_else(|| errResponse("QR token has no username"))?;

    // Try local JSON database first
    let user_val = match self.jsonProvider.find_all("users").await {
      Ok(users) => users.into_iter().find_map(|u| {
        serde_json::from_value::<UserEntity>(u.clone())
          .ok()
          .filter(|user| user.username == username)
          .map(|_| u)
      }),
      Err(_) => None,
    };

    // Fall back to MongoDB
    let user_val = if let Some(val) = user_val {
      val
    } else if let Some(ref mongoProvider) = self.mongodbProvider {
      match mongoProvider.find_all("users").await {
        Ok(users) => users
          .into_iter()
          .find_map(|u| {
            serde_json::from_value::<UserEntity>(u.clone())
              .ok()
              .filter(|user| user.username == username)
              .map(|_| u)
          })
          .ok_or_else(|| errResponse(&format!("User '{}' not found in database", username)))?,
        Err(e) => return Err(errResponse(&format!("Database error: {}", e))),
      }
    } else {
      return Err(errResponse("User not found and MongoDB unavailable"));
    };

    let user = serde_json::from_value::<UserEntity>(user_val.clone())
      .map_err(|e| errResponse(&format!("Failed to parse user: {}", e)))?;

    // Generate JWT token
    let token = self
      .tokenService
      .generateToken(&user.get_id(), &user.username, &user.role)?;

    // Cache user locally if from MongoDB
    if self.mongodbProvider.is_some() {
      if let Ok(user_val) = serde_json::to_value(&user) {
        let _ = self.jsonProvider.insert("users", user_val).await;
      }
    }

    eprintln!("[QR] Generated JWT token for user: {}", user.username);

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "QR login successful".to_string(),
      data: DataValue::String(token),
    })
  }
}
