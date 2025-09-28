/* sys lib */
use bcrypt::{hash, verify};
use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use mongodb::bson::{doc, from_bson, oid::ObjectId, to_bson, Bson, Uuid};
use serde_json::json;
use std::sync::Arc;

/* helpers */
use crate::helpers::mongodb_provider::MongodbProvider;

/* models */
use crate::models::{
  login_form_model::LoginForm,
  response_model::{DataValue, ResponseModel, ResponseStatus},
  signup_form_model::SignupForm,
  user_model::UserModel,
};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Claims {
  pub id: String,
  pub username: String,
  pub role: String,
  pub exp: usize,
}

#[allow(non_snake_case)]
pub struct AuthService {
  pub mongodbProvider: Arc<MongodbProvider>,
  pub jwtSecret: String,
}

impl AuthService {
  #[allow(non_snake_case)]
  pub fn new(mongodbProvider: Arc<MongodbProvider>, envValue: String) -> Self {
    Self {
      mongodbProvider: mongodbProvider,
      jwtSecret: envValue,
    }
  }

  #[allow(non_snake_case)]
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
          .getByField(&nameTable, Some(filter), None, &userId)
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

  #[allow(non_snake_case)]
  pub async fn login(&self, loginForm: LoginForm) -> Result<ResponseModel, ResponseModel> {
    let nameTable = "users".to_string();

    let filter = doc! { "username": loginForm.username.clone() };
    match self
      .mongodbProvider
      .getByField(&nameTable, Some(filter), None, "")
      .await
    {
      Ok(userDoc) => {
        let storedHash = match userDoc.get("password").and_then(|v| v.as_str()) {
          Some(hash) => hash,
          None => {
            return Err(ResponseModel {
              status: ResponseStatus::Error,
              message: "Error retrieving password".to_string(),
              data: DataValue::String("".to_string()),
            });
          }
        };

        match verify(&loginForm.password, storedHash) {
          Ok(true) => {
            let userId = match userDoc.get("id").and_then(|v| v.as_str()) {
              Some(id) => id.to_string(),
              None => {
                return Err(ResponseModel {
                  status: ResponseStatus::Error,
                  message: "Error retrieving user ID".to_string(),
                  data: DataValue::String("".to_string()),
                });
              }
            };
            let username = match userDoc.get("username").and_then(|v| v.as_str()) {
              Some(name) => name.to_string(),
              None => {
                return Err(ResponseModel {
                  status: ResponseStatus::Error,
                  message: "Error retrieving username".to_string(),
                  data: DataValue::String("".to_string()),
                });
              }
            };
            let role = match userDoc.get("role").and_then(|v| v.as_str()) {
              Some(role) => role.to_string(),
              None => {
                return Err(ResponseModel {
                  status: ResponseStatus::Error,
                  message: "Error retrieving role".to_string(),
                  data: DataValue::String("".to_string()),
                });
              }
            };

            let expiration = Utc::now() + Duration::hours(24);
            let claims = Claims {
              id: userId,
              username,
              role,
              exp: expiration.timestamp() as usize,
            };

            let secret = self.jwtSecret.clone();
            let token = match encode(
              &Header::default(),
              &claims,
              &EncodingKey::from_secret(secret.as_ref()),
            ) {
              Ok(token) => token,
              Err(_) => {
                return Err(ResponseModel {
                  status: ResponseStatus::Error,
                  message: "Error generating token".to_string(),
                  data: DataValue::String("".to_string()),
                });
              }
            };

            Ok(ResponseModel {
              status: ResponseStatus::Success,
              message: "Authentication successful".to_string(),
              data: DataValue::String(token),
            })
          }
          Ok(false) => Err(ResponseModel {
            status: ResponseStatus::Error,
            message: "Invalid password".to_string(),
            data: DataValue::String("".to_string()),
          }),
          Err(_) => Err(ResponseModel {
            status: ResponseStatus::Error,
            message: "Error verifying password".to_string(),
            data: DataValue::String("".to_string()),
          }),
        }
      }
      Err(e) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!("User not found: {}", e),
        data: DataValue::String("".to_string()),
      }),
    }
  }

  #[allow(non_snake_case)]
  pub async fn register(&self, signupForm: SignupForm) -> Result<ResponseModel, ResponseModel> {
    let nameTable = "users".to_string();

    let filter = doc! { "email": signupForm.email.clone() };
    match self
      .mongodbProvider
      .getByField(&nameTable, Some(filter), None, "")
      .await
    {
      Ok(_) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: "User with this email already exists".to_string(),
        data: DataValue::String("".to_string()),
      }),
      Err(e) if e.to_string().contains("Document not found") => {
        let user: UserModel = UserModel {
          _id: ObjectId::new(),
          id: Uuid::new().to_string(),
          email: signupForm.email.clone(),
          username: signupForm.username.clone(),
          password: match hash(&signupForm.password, 10) {
            Ok(hashed) => hashed,
            Err(_) => {
              return Err(ResponseModel {
                status: ResponseStatus::Error,
                message: "Error hashing password".to_string(),
                data: DataValue::String("".to_string()),
              });
            }
          },
          role: "user".to_string(),
          resetToken: "".to_string(),
          profileId: "".to_string(),
          createdAt: chrono::Utc::now().to_string(),
          updatedAt: chrono::Utc::now().to_string(),
        };

        let recordUser = match to_bson(&user) {
          Ok(Bson::Document(doc)) => doc,
          Ok(_) => {
            return Err(ResponseModel {
              status: ResponseStatus::Error,
              message: "Error serializing user: not a document".to_string(),
              data: DataValue::String("".to_string()),
            });
          }
          Err(e) => {
            return Err(ResponseModel {
              status: ResponseStatus::Error,
              message: format!("Error serializing user: {}", e),
              data: DataValue::String("".to_string()),
            });
          }
        };

        match self.mongodbProvider.create(&nameTable, recordUser).await {
          Ok(_) => Ok(ResponseModel {
            status: ResponseStatus::Success,
            message: "User created successfully".to_string(),
            data: DataValue::String("".to_string()),
          }),
          Err(e) => Err(ResponseModel {
            status: ResponseStatus::Error,
            message: format!("Error creating user: {}", e),
            data: DataValue::String("".to_string()),
          }),
        }
      }
      Err(e) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Error checking existing user: {}", e),
        data: DataValue::String("".to_string()),
      }),
    }
  }
}
