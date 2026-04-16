/* sys lib */
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

/* providers */
use nosql_orm::providers::JsonProvider;
use nosql_orm::providers::MongoProvider;
use nosql_orm::provider::DatabaseProvider;

/* models */
use crate::entities::{
  response_entity::{DataValue, ResponseModel, ResponseStatus},
  user_entity::UserEntity,
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
  pub mongodbProvider: Option<Arc<MongoProvider>>,
  pub jwtSecret: String,
}

impl AuthTokenService {
  pub fn new(
    jsonProvider: JsonProvider,
    mongodbProvider: Option<Arc<MongoProvider>>,
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
    if let Ok(Some(userVal)) = self.jsonProvider.find_by_id("users", &userId).await {
      let user: UserEntity = serde_json::from_value(userVal.clone())
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

    // STEP 2: Local database failed - try MongoDB (if available)
    let mongoProvider = match &self.mongodbProvider {
      Some(provider) => provider,
      None => {
        return Err(errResponse(
          "User not found in local database and MongoDB unavailable",
        ));
      }
    };

    match mongoProvider.find_by_id("users", &userId).await {
      Ok(Some(userVal)) => {
        let user: UserEntity = serde_json::from_value(userVal.clone())
          .map_err(|e| errResponse(&format!("Failed to parse user: {}", e)))?;

        // Sync user to local database for future offline use
        let _ = self.jsonProvider.insert("users", userVal).await;

        Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: "Token is valid".to_string(),
          data: DataValue::Object(serde_json::to_value(&user).unwrap()),
        })
      }
      Ok(None) => Err(errResponse("User not found")),
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
