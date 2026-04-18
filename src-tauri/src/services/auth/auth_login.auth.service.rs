/* sys lib */
use bcrypt::verify;
use std::sync::Arc;

/* providers */
use nosql_orm::provider::DatabaseProvider;
use nosql_orm::providers::JsonProvider;
use nosql_orm::providers::MongoProvider;

/* services */
use super::auth_token::AuthTokenService;

/* models */
use crate::entities::{
  login_form_entity::LoginForm,
  response_entity::{DataValue, ResponseModel, ResponseStatus},
  user_entity::UserEntity,
};

/* helpers */
use crate::helpers::response_helper::errResponse;

#[derive(Clone)]
pub struct AuthLoginService {
  pub jsonProvider: JsonProvider,
  pub mongodbProvider: Option<Arc<MongoProvider>>,
  pub tokenService: Arc<AuthTokenService>,
}

impl AuthLoginService {
  pub fn new(
    jsonProvider: JsonProvider,
    mongodbProvider: Option<Arc<MongoProvider>>,
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

    // ═════════════════════════════════════════════════════════════
    // STEP 1: Try local JSON database FIRST (works offline)
    // ═════════════════════════════════════════════════════════════
    match self.jsonProvider.find_all("users").await {
      Ok(users) => {
        for userVal in users {
          if let Ok(user) = serde_json::from_value::<UserEntity>(userVal.clone()) {
            if user.username == username {
              match verify(password, &user.password) {
                Ok(valid) => {
                  if valid {
                    let token = self.tokenService.generateToken(
                      &user.get_id(),
                      &user.username,
                      &user.role,
                    )?;

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

    match mongoProvider.find_all("users").await {
      Ok(users) => {
        let userVal = users
          .into_iter()
          .find_map(|u| {
            serde_json::from_value::<UserEntity>(u.clone())
              .ok()
              .filter(|user| user.username == username)
              .map(|_| u)
          })
          .ok_or_else(|| {
            errResponse("User not found. Please register first or check your username.")
          })?;

        let user = serde_json::from_value::<UserEntity>(userVal.clone())
          .map_err(|e| errResponse(&format!("Failed to parse user: {}", e)))?;

        match verify(password, &user.password) {
          Ok(valid) => {
            if valid {
              let _ = self.jsonProvider.insert("users", userVal.clone()).await;
              
              let user_id = user.get_id().to_string();
              
              let token = self.tokenService.generateToken(&user_id, &user.username, &user.role)?;

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
