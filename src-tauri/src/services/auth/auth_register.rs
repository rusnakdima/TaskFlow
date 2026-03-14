/* sys lib */
use bcrypt::{hash, DEFAULT_COST};
use serde_json::json;
use std::sync::Arc;
use uuid::Uuid;

/* providers */
use crate::providers::{json_provider::JsonProvider, mongodb_provider::MongodbProvider};

/* services */
use super::auth_token::AuthTokenService;

/* models */
use crate::models::{
  response_model::{DataValue, ResponseModel, ResponseStatus},
  signup_form_model::SignupForm,
  user_model::UserModel,
};

#[derive(Clone)]
pub struct AuthRegisterService {
  pub jsonProvider: JsonProvider,
  pub mongodbProvider: Option<Arc<MongodbProvider>>,
  pub tokenService: Arc<AuthTokenService>,
}

impl AuthRegisterService {
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

  pub async fn register(&self, signupData: SignupForm) -> Result<ResponseModel, ResponseModel> {
    let email = signupData.email;
    let username = signupData.username;
    let password = signupData.password;

    let filter = json!({ "email": email });

    // Check if MongoDB is available
    let mongoProvider = match &self.mongodbProvider {
      Some(provider) => provider,
      None => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: "Registration unavailable: MongoDB offline".to_string(),
          data: DataValue::String("".to_string()),
        });
      }
    };

    match mongoProvider.getAll("users", Some(filter)).await {
      Ok(users) => {
        if !users.is_empty() {
          return Err(ResponseModel {
            status: ResponseStatus::Error,
            message: "User already exists".to_string(),
            data: DataValue::String("".to_string()),
          });
        }

        let hashedPassword = hash(password, DEFAULT_COST).map_err(|e| ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Error hashing password: {}", e),
          data: DataValue::String("".to_string()),
        })?;

        let now = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);

        let newUser = UserModel {
          _id: mongodb::bson::oid::ObjectId::new(),
          id: Uuid::new_v4().to_string(),
          email,
          username,
          password: hashedPassword,
          role: "user".to_string(),
          temporaryCode: "".to_string(),
          codeExpiresAt: "".to_string(),
          profileId: "".to_string(),
          createdAt: now.clone(),
          updatedAt: now,
        };

        let userVal = serde_json::to_value(&newUser).unwrap();

        match mongoProvider.create("users", userVal.clone()).await {
          Ok(_) => {
            let _ = self.jsonProvider.create("users", userVal).await;

            // Generate JWT token with user info (same as login)
            let token = self
              .tokenService
              .generateToken(&newUser.id, &newUser.username, &newUser.role)?;

            Ok(ResponseModel {
              status: ResponseStatus::Success,
              message: "User registered successfully".to_string(),
              data: DataValue::String(token),
            })
          }
          Err(e) => Err(ResponseModel {
            status: ResponseStatus::Error,
            message: format!("Error creating user: {}", e),
            data: DataValue::String("".to_string()),
          }),
        }
      }
      Err(e) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Error checking user: {}", e),
        data: DataValue::String("".to_string()),
      }),
    }
  }
}
