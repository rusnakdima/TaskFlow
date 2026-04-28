use data_encoding::BASE64URL;
use rand::Rng;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Arc;

use super::auth_token::AuthTokenService;
use crate::entities::{
  response_entity::{DataValue, ResponseModel, ResponseStatus},
  table_entity::TableModelType,
  user_entity::UserEntity,
};
use crate::helpers::{
  profile_helper::check_profile_exists,
  response_helper::{err_response, success_response},
};
use nosql_orm::provider::DatabaseProvider;
use nosql_orm::providers::JsonProvider;
use nosql_orm::providers::MongoProvider;
use nosql_orm::query::Filter;

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
  json_provider: JsonProvider,
  mongodb_provider: Option<Arc<MongoProvider>>,
  token_service: Arc<AuthTokenService>,
}

impl Clone for QrAuthService {
  fn clone(&self) -> Self {
    Self {
      json_provider: self.json_provider.clone(),
      mongodb_provider: self.mongodb_provider.clone(),
      token_service: self.token_service.clone(),
    }
  }
}

impl QrAuthService {
  pub fn new(
    json_provider: JsonProvider,
    mongodb_provider: Option<Arc<MongoProvider>>,
    token_service: Arc<AuthTokenService>,
  ) -> Self {
    Self {
      json_provider,
      mongodb_provider,
      token_service,
    }
  }

  pub async fn generate_qr_token(
    &self,
    username: Option<&str>,
  ) -> Result<ResponseModel, ResponseModel> {
    let token = self.generate_token();
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
      .map_err(|e| err_response(&format!("Failed to serialize token: {}", e)))?;

    // QR login is cross-device, so MongoDB is primary store
    eprintln!("[QR] Attempting to store token in MongoDB first...");
    if let Some(ref mongo_provider) = self.mongodb_provider {
      match mongo_provider
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
      .json_provider
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

    let qr_code = self.generate_qr_code_image(&qr_data);

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

  pub async fn approve_qr_token(
    &self,
    token: &str,
    approving_username: &str,
  ) -> Result<ResponseModel, ResponseModel> {
    eprintln!(
      "[QR] approve_qr_token called with token: '{}', username: '{}'",
      token, approving_username
    );

    let qr_token = self.find_qr_token(token).await?;
    eprintln!("[QR] Token found, approved={}", qr_token.approved);

    if qr_token.approved {
      return Err(err_response("QR code already approved"));
    }

    if qr_token.expires_at < chrono::Utc::now().timestamp() {
      return Err(err_response("QR code has expired"));
    }

    let now = chrono::Utc::now().timestamp();

    let mut updated_token = qr_token.clone();
    updated_token.approved = true;
    updated_token.approved_at = Some(now);
    updated_token.approved_by = Some(approving_username.to_string());
    if updated_token.username.is_none() {
      updated_token.username = Some(approving_username.to_string());
    }

    self.save_qr_token(&updated_token).await?;

    eprintln!(
      "[QR] Token approved by {} for user {:?}",
      approving_username, qr_token.username
    );

    Ok(success_response("QR code approved"))
  }

  pub async fn get_qr_status(&self, token: &str) -> Result<ResponseModel, ResponseModel> {
    eprintln!("[QR] get_qr_status called with token: '{}'", token);

    match self.find_qr_token(token).await {
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
          response_data["approved_by"] = json!(approved_by);
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

  pub async fn generate_qr_token_for_desktop_login(
    &self,
    username: &str,
  ) -> Result<ResponseModel, ResponseModel> {
    let token = self.generate_token();
    let now = chrono::Utc::now().timestamp();

    let qr_token = QrToken {
      id: token.clone(),
      username: Some(username.to_string()),
      created_at: now,
      expires_at: now + QR_TOKEN_TTL_SECS,
      approved: true,
      approved_at: Some(now),
      approved_by: Some(username.to_string()),
    };

    let qr_token_json = serde_json::to_value(&qr_token)
      .map_err(|e| err_response(&format!("Failed to serialize token: {}", e)))?;

    eprintln!("[QR] Storing desktop login token in MongoDB first...");
    if let Some(ref mongo_provider) = self.mongodb_provider {
      match mongo_provider
        .insert("qr_tokens", qr_token_json.clone())
        .await
      {
        Ok(_) => {
          eprintln!("[QR] Successfully stored desktop token in MongoDB");
        }
        Err(e) => {
          eprintln!("[QR] Failed to store desktop token in MongoDB: {}", e);
        }
      }
    }

    eprintln!("[QR] Storing desktop login token in local DB...");
    match self
      .json_provider
      .insert("qr_tokens", qr_token_json.clone())
      .await
    {
      Ok(result) => {
        eprintln!(
          "[QR] Successfully stored desktop token in local DB, result: {}",
          result
        );
      }
      Err(e) => {
        eprintln!("[QR] Failed to store desktop token in local DB: {}", e);
      }
    }

    eprintln!(
      "[QR] Generated desktop login token: '{}' for user: '{}'",
      token, username
    );

    let qr_payload = format!("{{\"t\":\"{}\",\"ts\":{},\"d\":\"desktop\"}}", token, now);

    let qr_data = format!("taskflow://qrlogin?data={}", qr_payload);

    let qr_code = self.generate_qr_code_image(&qr_data);

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "QR code generated for desktop login".to_string(),
      data: DataValue::Object(json!({
          "token": token,
          "qrCode": qr_code,
          "expiresAt": now + QR_TOKEN_TTL_SECS
      })),
    })
  }

  pub async fn toggle_qr_login(
    &self,
    username: &str,
    enabled: bool,
  ) -> Result<ResponseModel, ResponseModel> {
    eprintln!("[QR] toggle_qr_login called for {}: {}", username, enabled);
    Ok(success_response(if enabled {
      "QR login enabled"
    } else {
      "QR login disabled"
    }))
  }

  fn generate_token(&self) -> String {
    let bytes: [u8; 32] = rand::thread_rng().gen();
    BASE64URL.encode(&bytes)
  }

  fn generate_qr_code_image(&self, data: &str) -> String {
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

  async fn find_qr_token(&self, token: &str) -> Result<QrToken, ResponseModel> {
    eprintln!("[QR] Searching for token: '{}'", token);

    // QR login is cross-device, so check MongoDB first (shared state)
    eprintln!("[QR] Searching in MongoDB first...");
    if let Some(ref mongo_provider) = self.mongodb_provider {
      match mongo_provider.find_all("qr_tokens").await {
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
    match self.json_provider.find_all("qr_tokens").await {
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
    Err(err_response("Token not found"))
  }

  async fn save_qr_token(&self, token: &QrToken) -> Result<(), ResponseModel> {
    let token_val = serde_json::to_value(token)
      .map_err(|e| err_response(&format!("Failed to serialize token: {}", e)))?;

    // QR login is cross-device, so MongoDB is primary store
    if let Some(ref mongo_provider) = self.mongodb_provider {
      if let Err(e) = mongo_provider
        .update("qr_tokens", &token.id, token_val.clone())
        .await
      {
        eprintln!("[QR] Failed to update token in MongoDB: {}", e);
      }
    }

    // Also update local cache
    if let Err(e) = self
      .json_provider
      .update("qr_tokens", &token.id, token_val)
      .await
    {
      eprintln!("[QR] Failed to update token in local DB: {}", e);
    }

    Ok(())
  }

  /// Complete QR login: generate a JWT token for the approved user
  pub async fn complete_qr_login(&self, token: &str) -> Result<ResponseModel, ResponseModel> {
    eprintln!("[QR] complete_qr_login called with token: '{}'", token);

    // Verify QR token is approved
    let qr_token = self.find_qr_token(token).await?;

    if !qr_token.approved {
      return Err(err_response("QR code not yet approved"));
    }

    if qr_token.expires_at < chrono::Utc::now().timestamp() {
      return Err(err_response("QR code has expired"));
    }

    let username = qr_token
      .username
      .ok_or_else(|| err_response("QR token has no username"))?;

    // Try local JSON database first
    let table_name = TableModelType::User.table_name();
    let filter = Filter::Eq("username".to_string(), serde_json::json!(username));

    let user_val = match self
      .json_provider
      .find_many(table_name, Some(&filter), None, None, None, true)
      .await
    {
      Ok(mut users) => {
        if users.is_empty() {
          None
        } else {
          Some(users.remove(0))
        }
      }
      Err(_) => None,
    };

    // Fall back to MongoDB
    let user_val = if let Some(val) = user_val {
      val
    } else {
      let mongo = self
        .mongodb_provider
        .as_ref()
        .ok_or_else(|| err_response("User not found and MongoDB unavailable"))?;
      let mut users = mongo
        .find_many(table_name, Some(&filter), None, None, None, true)
        .await
        .map_err(|e| err_response(&format!("Database error: {}", e)))?;
      users
        .pop()
        .ok_or_else(|| err_response(&format!("User '{}' not found in database", username)))?
    };

    let user = serde_json::from_value::<UserEntity>(user_val.clone())
      .map_err(|e| err_response(&format!("Failed to parse user: {}", e)))?;

    let user_id = user.id().to_string();

    // Generate JWT token
    let token = self.token_service.generate_token(&user_id, "", "")?;

    // Cache user locally if from MongoDB
    if self.mongodb_provider.is_some() {
      if let Ok(user_val) = serde_json::to_value(&user) {
        let _ = self.json_provider.insert(table_name, user_val).await;
      }
    }

    // Check if profile exists (JSON first, then MongoDB)
    let profile = check_profile_exists(
      &self.json_provider,
      self.mongodb_provider.as_deref(),
      &user_id,
    )
    .await
    .ok()
    .flatten();

    let needs_profile = profile.is_none();

    eprintln!("[QR] Generated JWT token for user: {}", user.username);

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "QR login successful".to_string(),
      data: DataValue::Object(serde_json::json!({
        "token": token,
        "needsProfile": needs_profile,
        "profile": profile,
        "userId": user_id
      })),
    })
  }
}
