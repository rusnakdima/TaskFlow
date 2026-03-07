/* sys lib */
use bcrypt::verify;
use mongodb::bson::doc;
use serde_json::json;
use std::sync::Arc;

/* providers */
use crate::providers::{json_provider::JsonProvider, mongodb_provider::MongodbProvider};

/* models */
use crate::models::{
  login_form_model::LoginForm,
  response_model::{DataValue, ResponseModel, ResponseStatus},
};

/* services */
use super::auth_token::AuthTokenService;

pub struct AuthLoginService {
  pub jsonProvider: JsonProvider,
  pub mongodbProvider: Arc<MongodbProvider>,
  pub tokenService: AuthTokenService,
}

impl AuthLoginService {
  pub fn new(
    jsonProvider: JsonProvider,
    mongodbProvider: Arc<MongodbProvider>,
    tokenService: AuthTokenService,
  ) -> Self {
    Self {
      jsonProvider,
      mongodbProvider,
      tokenService,
    }
  }

  pub async fn login(&self, loginForm: LoginForm) -> Result<ResponseModel, ResponseModel> {
    let nameTable = "users".to_string();

    let filter = doc! { "username": loginForm.username.clone() };
    match self
      .mongodbProvider
      .get(&nameTable, Some(filter), None, "")
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

            // Generate token (7 days if remember, 24 hours otherwise)
            let expirationDays = if loginForm.remember { 7 } else { 1 };
            let token =
              self
                .tokenService
                .generateToken(userId.clone(), username, role, expirationDays)?;

            // Sync user to local storage
            let userExistsLocally = self
              .jsonProvider
              .get("users", Some(json!({"id": userId.clone()})), None, "")
              .await
              .is_ok();

            if !userExistsLocally {
              let userData = match serde_json::to_value(&userDoc) {
                Ok(data) => data,
                Err(_) => {
                  json!({})
                }
              };

              if let Err(_) = self.jsonProvider.create("users", userData).await {}
            }

            // Sync profile to local storage
            let profileFilter = doc! { "userId": userId.clone() };
            match self
              .mongodbProvider
              .get("profiles", Some(profileFilter), None, "")
              .await
            {
              Ok(profileDoc) => {
                let profileExistsLocally = self
                  .jsonProvider
                  .get(
                    "profiles",
                    Some(json!({"userId": userId.clone()})),
                    None,
                    "",
                  )
                  .await
                  .is_ok();

                if !profileExistsLocally {
                  let profileData = match serde_json::to_value(&profileDoc) {
                    Ok(data) => data,
                    Err(_) => {
                      json!({})
                    }
                  };

                  if let Err(_) = self.jsonProvider.create("profiles", profileData).await {}
                }
              }
              Err(_) => {}
            }

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
}
