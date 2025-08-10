/* sys lib */
use bcrypt::{hash, verify};
use chrono::{Duration, Utc};
use jsonwebtoken::{encode, EncodingKey, Header};
use mongodb::{
  bson::{doc, oid::ObjectId, Document, Uuid},
  Collection,
};
use serde::{Deserialize, Serialize};
use std::env;

/* helpers */
use crate::helpers::mongodb_provider::MongodbProvider;

/* models */
use crate::models::{
  login_form_model::LoginForm,
  response::{DataValue, ResponseModel, ResponseStatus},
  signup_form_model::SignupForm,
  user_model::UserModel,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
  pub id: String,
  pub username: String,
  pub role: String,
  pub exp: usize,
}

#[allow(non_snake_case)]
pub struct AuthService {
  pub mongodbProvider: MongodbProvider,
}

impl AuthService {
  pub fn new() -> Self {
    Self {
      mongodbProvider: MongodbProvider::new(),
    }
  }

  #[allow(non_snake_case)]
  pub async fn login(&self, loginForm: LoginForm) -> Result<ResponseModel, ResponseModel> {
    let collection_name = "users".to_string();
    let filter = doc! { "username": loginForm.username };

    let collection_users: Collection<Document> = match self
      .mongodbProvider
      .get_collection(collection_name.as_str())
      .await
    {
      Ok(coll) => coll,
      Err(e) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Error getting collection: {}", e),
          data: DataValue::String("".to_string()),
        });
      }
    };

    match collection_users.find_one(filter).await {
      Ok(Some(user_doc)) => {
        let stored_hash = match user_doc.get_str("password") {
          Ok(hash) => hash,
          Err(_) => {
            return Err(ResponseModel {
              status: ResponseStatus::Error,
              message: "Error retrieving password".to_string(),
              data: DataValue::String("".to_string()),
            });
          }
        };

        match verify(loginForm.password, stored_hash) {
          Ok(_) => {
            let user_id = match user_doc.get_str("id") {
              Ok(id) => id.to_string(),
              Err(_) => {
                return Err(ResponseModel {
                  status: ResponseStatus::Error,
                  message: "Error retrieving user ID".to_string(),
                  data: DataValue::String("".to_string()),
                });
              }
            };
            let username = match user_doc.get_str("username") {
              Ok(name) => name.to_string(),
              Err(_) => {
                return Err(ResponseModel {
                  status: ResponseStatus::Error,
                  message: "Error retrieving username".to_string(),
                  data: DataValue::String("".to_string()),
                });
              }
            };
            let role = match user_doc.get_str("role") {
              Ok(role) => role.to_string(),
              Err(_) => {
                return Err(ResponseModel {
                  status: ResponseStatus::Error,
                  message: "Error retrieving role".to_string(),
                  data: DataValue::String("".to_string()),
                });
              }
            };

            let expiration = Utc::now() + Duration::hours(1);
            let claims = Claims {
              id: user_id,
              username,
              role,
              exp: expiration.timestamp() as usize,
            };

            let secret = env::var("JWT_SECRET").expect("JWT_SECRET must be set");
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

            return Ok(ResponseModel {
              status: ResponseStatus::Success,
              message: "Authentication successful".to_string(),
              data: DataValue::String(token),
            });
          }
          Err(_) => {
            return Err(ResponseModel {
              status: ResponseStatus::Error,
              message: "Error verifying password".to_string(),
              data: DataValue::String("".to_string()),
            })
          }
        }
      }
      Ok(None) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: "User not found".to_string(),
          data: DataValue::String("".to_string()),
        })
      }
      Err(e) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Database error: {}", e),
          data: DataValue::String("".to_string()),
        })
      }
    }
  }

  #[allow(non_snake_case)]
  pub async fn register(&self, signupForm: SignupForm) -> Result<ResponseModel, ResponseModel> {
    let collection_name = "users".to_string();

    let collection_users = match self
      .mongodbProvider
      .get_collection(collection_name.as_str())
      .await
    {
      Ok(coll) => coll,
      Err(e) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Error getting collection: {}", e),
          data: DataValue::String("".to_string()),
        });
      }
    };

    let filter = doc! { "email": signupForm.email.clone() };
    match collection_users.find_one(filter).await {
      Ok(Some(_)) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: "User with this email already exists".to_string(),
          data: DataValue::String("".to_string()),
        });
      }
      Ok(None) => { /* Proceed with registration */ }
      Err(e) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Error checking existing user: {}", e),
          data: DataValue::String("".to_string()),
        });
      }
    }

    let user: UserModel = UserModel {
      _id: ObjectId::new(),
      id: Uuid::new().to_string(),
      email: signupForm.email.clone(),
      username: signupForm.username.clone(),
      password: match hash(signupForm.password.clone(), 10) {
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
      prodileId: "".to_string(),
      createdAt: chrono::Utc::now().to_string(),
      updatedAt: chrono::Utc::now().to_string(),
    };

    let user_doc = match mongodb::bson::to_document(&user) {
      Ok(doc) => doc,
      Err(e) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Error serializing user: {}", e),
          data: DataValue::String("".to_string()),
        });
      }
    };

    match collection_users.insert_one(user_doc).await {
      Ok(_) => {
        return Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: "User created successfully".to_string(),
          data: DataValue::String("".to_string()),
        })
      }
      Err(e) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Error creating user: {}", e),
          data: DataValue::String("".to_string()),
        })
      }
    }
  }
}
