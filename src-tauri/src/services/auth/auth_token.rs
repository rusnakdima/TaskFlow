/* sys lib */
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

/* providers */
use crate::providers::{json_provider::JsonProvider, mongodb_provider::MongodbProvider};

/* models */
use crate::models::{
  response_model::{DataValue, ResponseModel, ResponseStatus},
  user_model::UserModel,
};

/* helpers */
use crate::helpers::response_helper::errResponse;

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
  pub id: String,
  pub username: String,
  pub role: String,
  pub exp: usize,
}

#[derive(Clone)]
pub struct AuthTokenService {
  pub jsonProvider: JsonProvider,
  pub mongodbProvider: Option<Arc<MongodbProvider>>,
  pub jwtSecret: String,
}

impl AuthTokenService {
  pub fn new(
    jsonProvider: JsonProvider,
    mongodbProvider: Option<Arc<MongodbProvider>>,
    jwtSecret: String,
  ) -> Self {
    Self {
      jsonProvider,
      mongodbProvider,
      jwtSecret,
    }
  }

  pub fn generateToken(
    &self,
    userId: &str,
    username: &str,
    role: &str,
  ) -> Result<String, ResponseModel> {
    let expiration = chrono::Utc::now()
      .checked_add_signed(chrono::Duration::hours(24))
      .expect("valid timestamp")
      .timestamp() as usize;

    let claims = Claims {
      id: userId.to_owned(),
      username: username.to_owned(),
      role: role.to_owned(),
      exp: expiration,
    };

    encode(
      &Header::default(),
      &claims,
      &EncodingKey::from_secret(self.jwtSecret.as_ref()),
    )
    .map_err(|e| errResponse(&format!("Token generation failed: {}", e)))
  }

  pub async fn checkToken(&self, token: String) -> Result<ResponseModel, ResponseModel> {
    // Decode and validate JWT token
    let tokenData = decode::<Claims>(
      &token,
      &DecodingKey::from_secret(self.jwtSecret.as_ref()),
      &Validation::default(),
    )
    .map_err(|e| errResponse(&format!("Invalid token: {}", e)))?;

    let userId = tokenData.claims.id;

    // STEP 1: Check local JSON database FIRST (works offline)
    match self.jsonProvider.get("users", &userId).await {
      Ok(userVal) => {
        let user: UserModel = serde_json::from_value(userVal.clone())
          .map_err(|e| errResponse(&format!("Failed to parse user: {}", e)))?;

        // Try to sync with MongoDB in background (non-blocking)
        if self.mongodbProvider.is_some() {
          let _ = self.syncUserToCloud(userVal.clone()).await;
        }

        return Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: "Token is valid (local)".to_string(),
          data: DataValue::Object(serde_json::to_value(&user).unwrap()),
        });
      }
      Err(_) => {
        // Local database error - continue to MongoDB
      }
    }

    // STEP 2: Local database failed - try MongoDB (if available)
    let mongoProvider = match &self.mongodbProvider {
      Some(provider) => provider,
      None => {
        return Err(errResponse(
          "User not found in local database and MongoDB unavailable",
        ));
      }
    };

    match mongoProvider.get("users", &userId).await {
      Ok(userVal) => {
        let user: UserModel = serde_json::from_value(userVal.clone())
          .map_err(|e| errResponse(&format!("Failed to parse user: {}", e)))?;

        // Sync user to local database for future offline use
        let _ = self.jsonProvider.create("users", userVal).await;

        Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: "Token is valid".to_string(),
          data: DataValue::Object(serde_json::to_value(&user).unwrap()),
        })
      }
      Err(e) => Err(errResponse(&format!("User not found: {}", e))),
    }
  }

  /// Sync user data to MongoDB (non-blocking, best effort)
  async fn syncUserToCloud(&self, userVal: serde_json::Value) -> Result<(), ()> {
    let mongoProvider = match &self.mongodbProvider {
      Some(provider) => provider,
      None => return Ok(()), // Skip sync if MongoDB unavailable
    };

    let userId = userVal
      .get("id")
      .and_then(|v| v.as_str())
      .ok_or(())?
      .to_owned();
    let _ = mongoProvider.update("users", &userId, userVal).await;
    Ok(())
  }
}
