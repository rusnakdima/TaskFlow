/* sys lib */
use bcrypt::{hash, verify};
use chrono::{Duration, Utc};
use jsonwebtoken::{encode, EncodingKey, Header};
use mongodb::{
  bson::{doc, Document},
  Collection,
};
use serde::{Deserialize, Serialize};
use std::env;

/* models */
use crate::models::{
  login_form::LoginForm,
  mongo_config::MongoConfig,
  response::{DataValue, Response},
  signup_form::SignupForm,
  user::UserModel,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
  pub id: String,
  pub username: String,
  pub role: String,
  pub exp: usize,
}

#[allow(non_snake_case)]
pub async fn login(loginForm: LoginForm) -> Response {
  let config = MongoConfig::new();
  let collection_name = "users".to_string();
  let filter = doc! { "username": loginForm.username };

  let collection_users: Collection<Document> =
    match config.get_collection(collection_name.as_str()).await {
      Ok(coll) => coll,
      Err(e) => {
        return Response {
          status: "error".to_string(),
          message: format!("Error getting collection: {}", e),
          data: DataValue::String("".to_string()),
        };
      }
    };

  match collection_users.find_one(filter).await {
    Ok(Some(user_doc)) => {
      let stored_hash = match user_doc.get_str("password") {
        Ok(hash) => hash,
        Err(_) => {
          return Response {
            status: "error".to_string(),
            message: "Error retrieving password".to_string(),
            data: DataValue::String("".to_string()),
          };
        }
      };

      match verify(loginForm.password, stored_hash) {
        Ok(_) => {
          let user_id = match user_doc.get_object_id("_id") {
            Ok(id) => id.to_string(),
            Err(_) => {
              return Response {
                status: "error".to_string(),
                message: "Error retrieving user ID".to_string(),
                data: DataValue::String("".to_string()),
              };
            }
          };
          let username = match user_doc.get_str("username") {
            Ok(name) => name.to_string(),
            Err(_) => {
              return Response {
                status: "error".to_string(),
                message: "Error retrieving username".to_string(),
                data: DataValue::String("".to_string()),
              };
            }
          };
          let role = match user_doc.get_str("role") {
            Ok(role) => role.to_string(),
            Err(_) => {
              return Response {
                status: "error".to_string(),
                message: "Error retrieving role".to_string(),
                data: DataValue::String("".to_string()),
              };
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
              return Response {
                status: "error".to_string(),
                message: "Error generating token".to_string(),
                data: DataValue::String("".to_string()),
              };
            }
          };

          Response {
            status: "success".to_string(),
            message: "Authentication successful".to_string(),
            data: DataValue::String(token),
          }
        }
        Err(_) => Response {
          status: "error".to_string(),
          message: "Error verifying password".to_string(),
          data: DataValue::String("".to_string()),
        },
      }
    }
    Ok(None) => Response {
      status: "error".to_string(),
      message: "User not found".to_string(),
      data: DataValue::String("".to_string()),
    },
    Err(e) => Response {
      status: "error".to_string(),
      message: format!("Database error: {}", e),
      data: DataValue::String("".to_string()),
    },
  }
}

#[allow(non_snake_case)]
pub async fn register(signupForm: SignupForm) -> Response {
  let config = MongoConfig::new();
  let collection_name = "users".to_string();

  let collection_users = match config.get_collection(collection_name.as_str()).await {
    Ok(coll) => coll,
    Err(e) => {
      return Response {
        status: "error".to_string(),
        message: format!("Error getting collection: {}", e),
        data: DataValue::String("".to_string()),
      };
    }
  };

  let filter = doc! { "email": signupForm.email.clone() };
  match collection_users.find_one(filter).await {
    Ok(Some(_)) => {
      return Response {
        status: "error".to_string(),
        message: "User with this email already exists".to_string(),
        data: DataValue::String("".to_string()),
      };
    }
    Ok(None) => { /* Proceed with registration */ }
    Err(e) => {
      return Response {
        status: "error".to_string(),
        message: format!("Error checking existing user: {}", e),
        data: DataValue::String("".to_string()),
      };
    }
  }

  let user: UserModel = UserModel {
    id: None,
    email: signupForm.email.clone(),
    username: signupForm.username.clone(),
    password: match hash(signupForm.password.clone(), 10) {
      Ok(hashed) => hashed,
      Err(_) => {
        return Response {
          status: "error".to_string(),
          message: "Error hashing password".to_string(),
          data: DataValue::String("".to_string()),
        };
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
      return Response {
        status: "error".to_string(),
        message: format!("Error serializing user: {}", e),
        data: DataValue::String("".to_string()),
      };
    }
  };

  match collection_users.insert_one(user_doc).await {
    Ok(_) => Response {
      status: "success".to_string(),
      message: "User created successfully".to_string(),
      data: DataValue::String("".to_string()),
    },
    Err(e) => Response {
      status: "error".to_string(),
      message: format!("Error creating user: {}", e),
      data: DataValue::String("".to_string()),
    },
  }
}
