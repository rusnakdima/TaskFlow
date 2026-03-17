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

/* helpers */
use crate::helpers::response_helper::errResponse;

#[derive(Clone)]
pub struct AuthLoginService {
  pub jsonProvider: JsonProvider,
  pub mongodbProvider: Option<Arc<MongodbProvider>>,
  pub tokenService: Arc<AuthTokenService>,
}

impl AuthLoginService {
  pub fn new(
    jsonProvider: JsonProvider,
    mongodbProvider: Option<Arc<MongodbProvider>>,
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

    // ═════════════════════════════════════════════════════════════
    // STEP 1: Try local JSON database FIRST (works offline)
    // ═════════════════════════════════════════════════════════════
    match self
      .jsonProvider
      .getAll("users", Some(filter.clone()))
      .await
    {
      Ok(users) => {
        if let Some(userVal) = users.first() {
          let user: UserModel = serde_json::from_value(userVal.clone())
            .map_err(|e| errResponse(&format!("Failed to parse user: {}", e)))?;

          match verify(password, &user.password) {
            Ok(valid) => {
              if valid {
                let token =
                  self
                    .tokenService
                    .generateToken(&user.id, &user.username, &user.role)?;

                return Ok(ResponseModel {
                  status: ResponseStatus::Success,
                  message: "Login successful (local)".to_string(),
                  data: DataValue::String(token),
                });
              } else {
                return Err(errResponse("Invalid password"));
              }
            }
            Err(e) => {
              return Err(errResponse(&format!("Error verifying password: {}", e)));
            }
          }
        }
      }
      Err(_e) => {
        // Local database error - continue to MongoDB
      }
    }

    // ═════════════════════════════════════════════════════════════
    // STEP 2: Local database failed - try MongoDB (if available)
    // ═════════════════════════════════════════════════════════════
    let mongoProvider = match &self.mongodbProvider {
      Some(provider) => provider,
      None => {
        return Err(errResponse(
          "User not found in local database and MongoDB unavailable",
        ))
      }
    };

    match mongoProvider.getAll("users", Some(filter)).await {
      Ok(users) => {
        let userVal = users.first().ok_or_else(|| {
          errResponse("User not found. Please register first or check your username.")
        })?;

        let user: UserModel = serde_json::from_value(userVal.clone())
          .map_err(|e| errResponse(&format!("Failed to parse user: {}", e)))?;

        match verify(password, &user.password) {
          Ok(valid) => {
            if valid {
              let _ = self.jsonProvider.create("users", userVal.clone()).await;
              let token = self
                .tokenService
                .generateToken(&user.id, &user.username, &user.role)?;

              Ok(ResponseModel {
                status: ResponseStatus::Success,
                message: "Login successful".to_string(),
                data: DataValue::String(token),
              })
            } else {
              Err(errResponse("Invalid password"))
            }
          }
          Err(e) => Err(errResponse(&format!("Error verifying password: {}", e))),
        }
      }
      Err(e) => {
        let errorMsg = e.to_string();
        if errorMsg.contains("Server selection timeout") || errorMsg.contains("connection") {
          Err(errResponse("User not found in local database. MongoDB unavailable - cannot verify credentials.\n\nPlease ensure:\n1. You have logged in before (to cache user locally)\n2. MongoDB server is running\n3. Network connection is available"))
        } else {
          Err(errResponse(&format!("Database error: {}", e)))
        }
      }
    }
  }
}
