/* sys lib */
use bcrypt::verify;
use serde_json::json;
use std::sync::Arc;

/* providers */
use crate::providers::{json_provider::JsonProvider, mongodb_provider::MongodbProvider};

/* services */
use super::auth_token::AuthTokenService;

/* models */
use crate::models::{
  login_form_model::LoginForm,
  response_model::{DataValue, ResponseModel, ResponseStatus},
  user_model::UserModel,
};

#[derive(Clone)]
pub struct AuthLoginService {
  pub jsonProvider: JsonProvider,
  pub mongodbProvider: Arc<MongodbProvider>,
  pub tokenService: Arc<AuthTokenService>,
}

impl AuthLoginService {
  pub fn new(
    jsonProvider: JsonProvider,
    mongodbProvider: Arc<MongodbProvider>,
    tokenService: Arc<AuthTokenService>,
  ) -> Self {
    Self {
      jsonProvider,
      mongodbProvider,
      tokenService,
    }
  }

  pub async fn login(&self, loginData: LoginForm) -> Result<ResponseModel, ResponseModel> {
    let username = loginData.username;
    let password = loginData.password;

    let filter = json!({ "username": username });

    match self.mongodbProvider.getAll("users", Some(filter)).await {
      Ok(users) => {
        let userVal = users.first().ok_or_else(|| ResponseModel {
          status: ResponseStatus::Error,
          message: "User not found".to_string(),
          data: DataValue::String("".to_string()),
        })?;

        let user: UserModel =
          serde_json::from_value(userVal.clone()).map_err(|e| ResponseModel {
            status: ResponseStatus::Error,
            message: format!("Failed to parse user: {}", e),
            data: DataValue::String("".to_string()),
          })?;

        match verify(password, &user.password) {
          Ok(valid) => {
            if valid {
              // Sync user to local if not exists
              let userId = user.id.clone();
              match self.jsonProvider.get("users", &userId).await {
                Ok(_) => {}
                Err(_) => {
                  let _ = self.jsonProvider.create("users", userVal.clone()).await;
                }
              }

              // Check profile
              if !user.profileId.is_empty() {
                match self.mongodbProvider.get("profiles", &user.profileId).await {
                  Ok(profileVal) => {
                    match self.jsonProvider.get("profiles", &user.profileId).await {
                      Ok(_) => {}
                      Err(_) => {
                        let _ = self.jsonProvider.create("profiles", profileVal).await;
                      }
                    }
                  }
                  Err(_) => {}
                }
              }

              // Generate JWT token with user info
              let token = self
                .tokenService
                .generateToken(&user.id, &user.username, &user.role)?;

              Ok(ResponseModel {
                status: ResponseStatus::Success,
                message: "Login successful".to_string(),
                data: DataValue::String(token),
              })
            } else {
              Err(ResponseModel {
                status: ResponseStatus::Error,
                message: "Invalid password".to_string(),
                data: DataValue::String("".to_string()),
              })
            }
          }
          Err(e) => Err(ResponseModel {
            status: ResponseStatus::Error,
            message: format!("Error verifying password: {}", e),
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
