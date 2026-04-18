/* sys lib */
use bcrypt::{hash, DEFAULT_COST};
use std::sync::Arc;
use uuid::Uuid;

/* providers */
use nosql_orm::provider::DatabaseProvider;
use nosql_orm::providers::JsonProvider;
use nosql_orm::providers::MongoProvider;

/* services */
use super::auth_token::AuthTokenService;

/* models */
use crate::entities::{
  response_entity::{DataValue, ResponseModel, ResponseStatus},
  signup_form_entity::SignupForm,
  user_entity::UserEntity,
};

/* helpers */
use crate::helpers::response_helper::errResponse;

#[derive(Clone)]
pub struct AuthRegisterService {
  pub jsonProvider: JsonProvider,
  pub mongodbProvider: Option<Arc<MongoProvider>>,
  pub tokenService: Arc<AuthTokenService>,
}

impl AuthRegisterService {
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

  pub async fn register(&self, signupData: SignupForm) -> Result<ResponseModel, ResponseModel> {
    let email = signupData.email;
    let username = signupData.username;
    let password = signupData.password;

    // Check if MongoDB is available
    let mongoProvider = match &self.mongodbProvider {
      Some(provider) => provider,
      None => {
        return Err(errResponse("Registration unavailable: MongoDB offline"));
      }
    };

    match mongoProvider.find_all("users").await {
      Ok(users) => {
        for userVal in users {
          if let Ok(user) = serde_json::from_value::<UserEntity>(userVal) {
            if user.email == email || user.username == username {
              return Err(errResponse("User already exists"));
            }
          }
        }

        let hashedPassword = hash(password, DEFAULT_COST)
          .map_err(|e| errResponse(&format!("Error hashing password: {}", e)))?;

        let now = chrono::Utc::now();

        let newUser = UserEntity {
          id: Some(Uuid::new_v4().to_string()),
          email,
          username,
          password: hashedPassword,
          role: "user".to_string(),
          temporaryCode: "".to_string(),
          codeExpiresAt: "".to_string(),
          profileId: "".to_string(),
          created_at: now,
          updated_at: now,
          deleted_at: None,
          profile: None,
          totpEnabled: false,
          totpSecret: String::new(),
          passkeyCredentialId: String::new(),
          passkeyPublicKey: String::new(),
          passkeyDevice: String::new(),
          passkeyEnabled: false,
          biometricEnabled: false,
          qrLoginEnabled: false,
          recoveryCodes: Vec::new(),
        };

        let userVal = serde_json::to_value(&newUser).unwrap();

        match mongoProvider.insert("users", userVal.clone()).await {
          Ok(_) => {
            let _ = self.jsonProvider.insert("users", userVal).await;

            // Generate JWT token with user info (same as login)
            let token = self.tokenService.generateToken(
              newUser.get_id(),
              &newUser.username,
              &newUser.role,
            )?;

            Ok(ResponseModel {
              status: ResponseStatus::Success,
              message: "User registered successfully".to_string(),
              data: DataValue::String(token),
            })
          }
          Err(e) => Err(errResponse(&format!("Error creating user: {}", e))),
        }
      }
      Err(e) => Err(errResponse(&format!("Error checking user: {}", e))),
    }
  }
}
