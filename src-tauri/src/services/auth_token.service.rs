/* sys lib */
use chrono::Utc;
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
use mongodb::bson::{doc, from_bson, Bson};

use serde_json::json;
use std::sync::Arc;

/* providers */
use crate::providers::mongodb_provider::MongodbProvider;

/* models */
use crate::models::{
  response_model::{DataValue, ResponseModel, ResponseStatus},
  user_model::UserModel,
};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Claims {
  pub id: String,
  pub username: String,
  pub role: String,
  pub exp: usize,
}

#[derive(Clone)]
pub struct AuthTokenService {
  pub mongodbProvider: Arc<MongodbProvider>,
  pub jwtSecret: String,
}

impl AuthTokenService {
  pub fn new(mongodbProvider: Arc<MongodbProvider>, jwtSecret: String) -> Self {
    Self {
      mongodbProvider,
      jwtSecret,
    }
  }

  pub async fn checkToken(&self, token: String) -> Result<ResponseModel, ResponseModel> {
    let secret = self.jwtSecret.clone();
    match decode::<Claims>(
      &token,
      &DecodingKey::from_secret(secret.as_ref()),
      &Validation::new(Algorithm::HS256),
    ) {
      Ok(decoded) => {
        if decoded.claims.exp < Utc::now().timestamp() as usize {
          return Err(ResponseModel {
            status: ResponseStatus::Error,
            message: "Token has expired".to_string(),
            data: DataValue::String("".to_string()),
          });
        }

        let userId = decoded.claims.id.clone();
        let nameTable = "users".to_string();
        let filter = doc! { "id": userId.clone() };

        match self
          .mongodbProvider
          .get(&nameTable, Some(filter), None, &userId)
          .await
        {
          Ok(userDoc) => {
            let user: UserModel =
              from_bson(Bson::Document(userDoc.clone())).map_err(|e| ResponseModel {
                status: ResponseStatus::Error,
                message: format!("Error deserializing user: {}", e),
                data: DataValue::String("".to_string()),
              })?;
            Ok(ResponseModel {
              status: ResponseStatus::Success,
              message: "Token is valid".to_string(),
              data: DataValue::Object(json!({
                "id": user.id,
                "username": user.username,
                "role": user.role,
              })),
            })
          }
          Err(e) => Err(ResponseModel {
            status: ResponseStatus::Error,
            message: format!("User not found: {}", e),
            data: DataValue::String("".to_string()),
          }),
        }
      }
      Err(_) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: "Invalid token".to_string(),
        data: DataValue::String("".to_string()),
      }),
    }
  }

  pub fn generate_token(
    &self,
    userId: String,
    username: String,
    role: String,
    expiration_days: i64,
  ) -> Result<String, ResponseModel> {
    use chrono::Duration;
    use jsonwebtoken::{encode, EncodingKey, Header};

    let expiration = Utc::now() + Duration::days(expiration_days);
    let claims = Claims {
      id: userId,
      username,
      role,
      exp: expiration.timestamp() as usize,
    };

    let secret = self.jwtSecret.clone();
    match encode(
      &Header::default(),
      &claims,
      &EncodingKey::from_secret(secret.as_ref()),
    ) {
      Ok(token) => Ok(token),
      Err(_) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: "Error generating token".to_string(),
        data: DataValue::String("".to_string()),
      }),
    }
  }
}
