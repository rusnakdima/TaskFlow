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

    // STEP 1: Try local JSON database FIRST (works offline)
    match self
      .jsonProvider
      .getAll("users", Some(filter.clone()))
      .await
    {
      Ok(users) => {
        if let Some(userVal) = users.first() {
          // User found in local database
          let user: UserModel =
            serde_json::from_value(userVal.clone()).map_err(|e| ResponseModel {
              status: ResponseStatus::Error,
              message: format!("Failed to parse user: {}", e),
              data: DataValue::String("".to_string()),
            })?;

          match verify(password, &user.password) {
            Ok(valid) => {
              if valid {
                // ✅ Password matches - generate token from local data
                let token =
                  self
                    .tokenService
                    .generateToken(&user.id, &user.username, &user.role)?;

                // Try to sync with MongoDB in background (non-blocking)
                if self.mongodbProvider.is_some() {
                  let _ = self.syncUserToCloud(userVal.clone(), &user.profileId).await;
                }

                return Ok(ResponseModel {
                  status: ResponseStatus::Success,
                  message: "Login successful (local)".to_string(),
                  data: DataValue::String(token),
                });
              } else {
                return Err(ResponseModel {
                  status: ResponseStatus::Error,
                  message: "Invalid password".to_string(),
                  data: DataValue::String("".to_string()),
                });
              }
            }
            Err(e) => {
              return Err(ResponseModel {
                status: ResponseStatus::Error,
                message: format!("Error verifying password: {}", e),
                data: DataValue::String("".to_string()),
              });
            }
          }
        }
      }
      Err(_) => {
        // Local database error - continue to MongoDB
      }
    }

    // STEP 2: Local database failed - try MongoDB (if available)
    let mongoProvider = match &self.mongodbProvider {
      Some(provider) => provider,
      None => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: "User not found in local database and MongoDB unavailable".to_string(),
          data: DataValue::String("".to_string()),
        });
      }
    };

    match mongoProvider.getAll("users", Some(filter)).await {
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
              // ✅ MongoDB login successful - sync to local
              let _userId = user.id.clone();
              let _ = self.jsonProvider.create("users", userVal.clone()).await;

              // Sync profile too
              if !user.profileId.is_empty() {
                let _ = self.syncProfileToCloud(&user.profileId).await;
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

  /// Sync user data to MongoDB (non-blocking, best effort)
  async fn syncUserToCloud(&self, userVal: serde_json::Value, profileId: &str) -> Result<(), ()> {
    let mongoProvider = match &self.mongodbProvider {
      Some(provider) => provider,
      None => return Ok(()), // Skip sync if MongoDB unavailable
    };

    // Try to update user in MongoDB if exists
    let clonedVal = userVal.clone();
    let userId = clonedVal.get("id").and_then(|v| v.as_str()).ok_or(())?;
    let _ = mongoProvider.update("users", userId, userVal).await;

    // Sync profile too
    if !profileId.is_empty() {
      let _ = self.syncProfileToCloud(profileId).await;
    }

    Ok(())
  }

  /// Sync profile to MongoDB (non-blocking, best effort)
  async fn syncProfileToCloud(&self, profileId: &str) -> Result<(), ()> {
    let mongoProvider = match &self.mongodbProvider {
      Some(provider) => provider,
      None => return Ok(()), // Skip sync if MongoDB unavailable
    };

    match self.jsonProvider.get("profiles", profileId).await {
      Ok(profileVal) => {
        let _ = mongoProvider
          .update("profiles", profileId, profileVal)
          .await;
      }
      Err(_e) => {
        // Silently handle error
      }
    }
    Ok(())
  }
}
